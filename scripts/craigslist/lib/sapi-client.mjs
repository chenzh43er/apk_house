import { SAPI_BASE } from './constants.mjs';
import { decodeSearchResponse } from './decode-listing.mjs';
import { craigslistFetch, isBlockedResponse } from './http.mjs';
import { fetchHtmlSearchListings } from './html-search.mjs';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildSearchUrl(options) {
  const params = new URLSearchParams({
    searchPath: options.searchPath || options.category || 'apa',
    batch: options.batch || '1-0-360-1-0',
    lang: 'en',
    cc: 'us'
  });

  if (options.query) params.set('query', options.query);
  if (options.postal) params.set('postal', options.postal);
  if (options.searchDistance) params.set('search_distance', String(options.searchDistance));
  if (options.minPrice != null) params.set('min_price', String(options.minPrice));
  if (options.maxPrice != null) params.set('max_price', String(options.maxPrice));
  if (options.hasPic) params.set('hasPic', '1');
  if (options.sort) params.set('sort', options.sort);

  return `${SAPI_BASE}?${params.toString()}`;
}

export async function fetchSearchPage(options) {
  const city = options.city;
  const url = buildSearchUrl(options);
  const { res, text, proxyUrl } = await craigslistFetch(url, {
    referer: `https://${city}.craigslist.org/search/${options.category || 'apa'}`,
    proxy: options.proxy
  });

  if (isBlockedResponse(res.status, text)) {
    const err = new Error(`Craigslist sapi HTTP ${res.status}: blocked`);
    err.blocked = true;
    err.proxyUrl = proxyUrl;
    throw err;
  }

  if (!res.ok) {
    throw new Error(`Craigslist sapi HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Craigslist sapi returned non-JSON: ${text.slice(0, 200)}`);
  }

  const listings = decodeSearchResponse(payload, {
    city,
    category: options.category || 'apa'
  });

  return {
    url,
    source: 'sapi',
    payload,
    listings,
    batch: payload?.data?.batch || null
  };
}

export async function fetchAllListingsSapi(options) {
  const max = options.max ?? 360;
  const delayMs = options.delayMs ?? 1200;
  const first = await fetchSearchPage({ ...options, batch: '1-0-360-1-0' });
  const all = [...first.listings];

  let batch = first.batch;
  while (all.length < max && batch) {
    await sleep(delayMs);
    const next = await fetchSearchPage({ ...options, batch });
    if (!next.listings.length) break;

    const seen = new Set(all.map((item) => item.posting_id));
    for (const item of next.listings) {
      if (seen.has(item.posting_id)) continue;
      all.push(item);
      seen.add(item.posting_id);
      if (all.length >= max) break;
    }

    batch = next.batch;
    if (next.listings.length < 50) break;
  }

  return all.slice(0, max);
}

export async function fetchAllListings(options) {
  const mode = options.mode || 'auto';

  if (mode === 'html') {
    const listings = await fetchHtmlSearchListings(options);
    return { listings, source: options.htmlFile ? 'html-file' : 'html' };
  }

  if (mode === 'sapi') {
    const listings = await fetchAllListingsSapi(options);
    return { listings, source: 'sapi' };
  }

  try {
    const listings = await fetchAllListingsSapi(options);
    return { listings, source: 'sapi' };
  } catch (error) {
    if (!error.blocked) throw error;
    console.warn('sapi blocked, falling back to HTML search page...');
    try {
      const listings = await fetchHtmlSearchListings(options);
      return { listings, source: 'html' };
    } catch (htmlError) {
      htmlError.proxyUrl = htmlError.proxyUrl || error.proxyUrl;
      htmlError.blocked = htmlError.blocked || htmlError.message?.includes('blocked');
      throw htmlError;
    }
  }
}
