import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { craigslistFetch, isBlockedResponse } from './http.mjs';
import { fetchHtml as fetchBrowserHtml, fetchSearchPage, withDetailPage } from './browser.mjs';
import {
  extractListingUrlsFromSearchHtml,
  extractListingUrlsFromSapiPayloads,
  mergeSearchListingUrls
} from './search-urls.mjs';
import { parseDetailHtml } from './parse-detail-page.mjs';
import { buildGeocodeQuery, geocodeAddress, parseUsAddressFallback } from './geocode.mjs';
import { saveListingImages } from './images.mjs';
import { mapListingToHouseGer } from './map-to-house.mjs';
import { listingKeyFromUrl, rememberListingKeys } from './listing-key.mjs';
import { createStepProgress, shortText } from './progress.mjs';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { extractListingUrlsFromSearchHtml } from './search-urls.mjs';

function slugFromUrl(url) {
  const match = url.match(/\/view\/d\/[^/]+\/([^/?#]+)/);
  return match ? match[1] : '';
}

function findSavedDetailHtml(url, detailHtmlDir) {
  if (!detailHtmlDir || !fs.existsSync(detailHtmlDir)) return null;

  const slug = slugFromUrl(url);
  const candidates = [
    path.join(detailHtmlDir, `${slug}.html`),
    path.join(detailHtmlDir, `${slug}.htm`)
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  for (const file of fs.readdirSync(detailHtmlDir)) {
    if (!/\.html?$/i.test(file)) continue;
    const full = path.join(detailHtmlDir, file);
    const html = fs.readFileSync(full, 'utf8');
    if (html.includes(url) || (slug && html.includes(slug))) return full;
  }

  return null;
}

async function loadDetailHtml(url, options) {
  const saved = findSavedDetailHtml(url, options.detailHtmlDir);
  if (saved) {
    return {
      html: fs.readFileSync(saved, 'utf8'),
      htmlFilePath: saved,
      source: 'saved-html'
    };
  }

  if (options.useBrowser) {
    const html = await fetchBrowserHtml(url, {
      proxy: options.proxy,
      headless: options.headless
    });

    if (options.saveDetailHtmlDir) {
      fs.mkdirSync(options.saveDetailHtmlDir, { recursive: true });
      const file = path.join(options.saveDetailHtmlDir, `${slugFromUrl(url) || randomUUID()}.html`);
      fs.writeFileSync(file, html, 'utf8');
    }

    return { html, htmlFilePath: '', source: 'browser' };
  }

  const { res, text } = await craigslistFetch(url, {
    referer: 'https://www.craigslist.org/',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    mode: 'document',
    proxy: options.proxy
  });

  if (isBlockedResponse(res.status, text)) {
    const err = new Error(`Detail page blocked for ${url}`);
    err.blocked = true;
    throw err;
  }
  if (!res.ok) {
    throw new Error(`Detail page HTTP ${res.status} for ${url}`);
  }

  if (options.saveDetailHtmlDir) {
    fs.mkdirSync(options.saveDetailHtmlDir, { recursive: true });
    const file = path.join(options.saveDetailHtmlDir, `${slugFromUrl(url) || randomUUID()}.html`);
    fs.writeFileSync(file, text, 'utf8');
  }

  return { html: text, htmlFilePath: '', source: 'live' };
}

function buildFallbackText(detail, geo) {
  const parts = [
    detail.title,
    detail.room ? `${detail.room} bed` : '',
    detail.area ? `${detail.area} sqft` : '',
    geo?.display_district ? `Located in ${geo.display_district}, ${geo.display_state || ''}`.trim() : ''
  ].filter(Boolean);
  return `${parts.join('. ')}.`.replace(/\.\./g, '.');
}

export async function processListingUrl(url, context, options = {}) {
  const saved = findSavedDetailHtml(url, options.detailHtmlDir);

  if (options.useBrowser && !saved) {
    return withDetailPage(url, {
      proxy: options.proxy,
      headless: options.headless
    }, async ({ html, downloadImage, capturedImages }) => finalizeListing(
      url, html, '', 'browser', context, options, downloadImage, capturedImages
    ));
  }

  const { html, htmlFilePath, source } = await loadDetailHtml(url, options);
  return finalizeListing(url, html, htmlFilePath, source, context, options);
}

async function finalizeListing(url, html, htmlFilePath, source, context, options, downloadImage, capturedImages) {
  const detail = parseDetailHtml(html, { url, htmlFilePath });

  let imageUrls = detail.image_urls;
  if (capturedImages?.size && imageUrls.length === 0) {
    imageUrls = [...capturedImages.keys()];
  }

  if (!imageUrls.length) {
    return { skipped: true, reason: 'no_images', url, detail };
  }

  const geoQuery = buildGeocodeQuery(detail, context);
  const geo = geoQuery
    ? await geocodeAddress(geoQuery, {
      countryCode: 'us',
      defaultState: context.displayState,
      locality: detail.locality
    })
    : parseUsAddressFallback(detail.full_address, context.displayState, { locality: detail.locality });

  const mainpic = randomUUID();
  const savedImages = await saveListingImages(imageUrls, {
    mainpic,
    imagesDir: options.imagesDir,
    proxy: options.proxy,
    referer: url,
    useBrowser: options.useBrowser,
    downloadImage
  });

  if (!savedImages.length) {
    return { skipped: true, reason: 'image_download_failed', url, detail };
  }

  if (!detail.description) {
    detail.description = buildFallbackText(detail, geo);
  }

  const listing = {
    ...detail,
    posting_id: detail.posting_id || slugFromUrl(url),
    image_files: savedImages,
    mainpic,
    geo
  };

  const houseGer = mapListingToHouseGer(listing, { ...context, geo });

  return {
    skipped: false,
    url,
    detail_source: source,
    craigslist: listing,
    house_ger: houseGer
  };
}

export async function fetchSearchListingUrls(searchOptions, fetchOptions = {}) {
  const { buildHtmlSearchUrl } = await import('./html-search.mjs');
  const searchUrl = buildHtmlSearchUrl(searchOptions);
  const context = {
    city: searchOptions.city,
    category: searchOptions.category || 'apa'
  };

  if (fetchOptions.useBrowser) {
    const { html, sapiPayloads } = await fetchSearchPage(searchUrl, {
      proxy: fetchOptions.proxy,
      headless: fetchOptions.headless,
      waitMs: fetchOptions.searchWaitMs ?? 6000,
      scrollSteps: fetchOptions.scrollSteps ?? 4
    });

    const htmlUrls = extractListingUrlsFromSearchHtml(html, context);
    const sapiUrls = extractListingUrlsFromSapiPayloads(sapiPayloads, context);
    const urls = mergeSearchListingUrls(htmlUrls, sapiUrls);

    if (urls.length <= 5) {
      console.warn(
        `Low search result count (${urls.length}) for ${searchOptions.city}. ` +
        `html=${htmlUrls.length}, sapi=${sapiUrls.length}. ` +
        'Check proxy/VPN or re-run with --no-resume.'
      );
    }

    return urls;
  }

  const { res, text } = await craigslistFetch(searchUrl, {
    referer: `https://${searchOptions.city}.craigslist.org/`,
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    mode: 'document',
    proxy: fetchOptions.proxy
  });

  if (isBlockedResponse(res.status, text)) {
    const err = new Error('Search page blocked');
    err.blocked = true;
    throw err;
  }

  return extractListingUrlsFromSearchHtml(text);
}

export async function processListingUrls(urls, context, options = {}) {
  const delayMs = options.delayMs ?? 1500;
  const max = options.max ?? urls.length;
  const seenKeys = options.seenKeys ?? new Set();
  const inputUrls = urls || [];

  const pending = [];
  let skippedAlready = 0;

  for (const url of inputUrls) {
    const key = listingKeyFromUrl(url);
    if (key && seenKeys.has(key)) {
      skippedAlready += 1;
      continue;
    }
    pending.push(url);
  }

  const limit = max > 0 ? Math.min(pending.length, max) : pending.length;
  const results = [];
  const stats = {
    input: inputUrls.length,
    pending: pending.length,
    skipped_already: skippedAlready,
    processed: 0,
    kept: 0,
    skipped_no_images: 0,
    skipped_errors: 0,
    limit
  };

  const progress = createStepProgress({
    label: options.progressLabel || 'Listing',
    total: limit,
    quiet: options.quietProgress === true
  });

  progress.start(
    `${limit} to process` +
    (skippedAlready ? `, ${skippedAlready} already done` : '') +
    (inputUrls.length !== pending.length ? `, ${inputUrls.length - pending.length - skippedAlready} filtered` : '')
  );

  for (let i = 0; i < limit; i += 1) {
    const url = pending[i];
    const urlLabel = shortText(url, 80);
    try {
      const result = await processListingUrl(url, context, options);
      stats.processed += 1;
      if (result.skipped) {
        if (result.reason === 'no_images') stats.skipped_no_images += 1;
        else stats.skipped_errors += 1;
        progress.tick(1, `skip (${result.reason}) ${urlLabel}`);
      } else {
        stats.kept += 1;
        results.push(result);
        rememberListingKeys(seenKeys, result);
        const title = shortText(result.craigslist?.title || result.house_ger?.name || '', 48);
        progress.tick(1, `kept ${title || urlLabel}`);
        options.onKept?.(result);
      }
    } catch (error) {
      stats.skipped_errors += 1;
      progress.tick(1, `error ${error.message} | ${urlLabel}`);
    }

    if (i < limit - 1) await sleep(delayMs);
  }

  progress.done(`kept=${stats.kept}, skip_no_images=${stats.skipped_no_images}, errors=${stats.skipped_errors}`);

  return { results, stats };
}
