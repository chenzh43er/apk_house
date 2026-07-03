import { decodeSearchResponse } from './decode-listing.mjs';

const HREF_PATTERNS = [
  /href="(https:\/\/www\.craigslist\.org\/view\/d\/[^"?#]+)"/gi,
  /href="(https:\/\/[a-z0-9-]+\.craigslist\.org\/[^"]*\/d\/[^"?#]+)"/gi,
  /href="(https:\/\/[a-z0-9-]+\.craigslist\.org\/[a-z0-9-]+\/[a-z0-9-]+\/d\/[^"?#]+\/\d+\.html)"/gi,
  /href="(\/[a-z0-9-]+\/d\/[^"?#]+)"/gi,
  /href="(\/[a-z0-9-]+\/[a-z0-9-]+\/d\/[^"?#]+\/\d+\.html)"/gi
];

export function normalizeSearchListingUrl(rawUrl, city = '') {
  if (!rawUrl) return '';

  const raw = String(rawUrl).replace(/&amp;/g, '&').trim();
  const postingMatch = raw.match(/[?&](postingID=\d+)/i);
  const postingQuery = postingMatch ? postingMatch[1] : '';

  let url = raw.split('#')[0];
  if (!postingQuery) {
    url = url.split('?')[0];
  } else {
    url = url.split('?')[0];
  }

  if (url.startsWith('//')) url = `https:${url}`;
  if (url.startsWith('/')) {
    const host = city ? `https://${city}.craigslist.org` : 'https://www.craigslist.org';
    url = `${host}${url}`;
  }

  if (postingQuery) {
    url = `${url}?${postingQuery}`;
  }

  return url;
}

export function extractListingUrlsFromSearchHtml(html, options = {}) {
  const city = options.city || '';
  const urls = new Set();

  for (const pattern of HREF_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(html))) {
      const normalized = normalizeSearchListingUrl(match[1], city);
      if (normalized) urls.add(normalized);
    }
  }

  return [...urls];
}

export function extractListingUrlsFromSapiPayloads(payloads, context = {}) {
  const urls = new Set();

  for (const payload of payloads || []) {
    const listings = decodeSearchResponse(payload, context);
    for (const listing of listings) {
      const normalized = normalizeSearchListingUrl(listing.url, context.city);
      if (normalized) urls.add(normalized);
    }
  }

  return [...urls];
}

export function extractPostingIdFromUrl(url) {
  const normalized = normalizeSearchListingUrl(String(url || '').trim());
  if (!normalized) return '';

  const fromQuery = normalized.match(/[?&]postingID=(\d+)/i);
  if (fromQuery) return fromQuery[1];

  const fromHtml = normalized.match(/\/(\d{8,})\.html$/i);
  if (fromHtml) return fromHtml[1];

  return '';
}

export function isLegacyBrokenListingUrl(url) {
  const normalized = normalizeSearchListingUrl(String(url || '').trim());
  if (!normalized) return false;
  if (/\/view\/d\//i.test(normalized)) return false;
  if (/\/[a-z0-9-]+\/[a-z0-9-]+\/d\/.+\/\d+\.html$/i.test(normalized)) return false;
  if (/[?&]postingID=\d+/i.test(normalized)) return false;
  return /\/[a-z0-9-]+\/[a-z0-9-]+\/\d+\.html$/i.test(normalized);
}

function listingUrlPriority(url) {
  if (/\/view\/d\//i.test(url)) return 40;
  if (/\/[a-z0-9-]+\/[a-z0-9-]+\/d\/.+\/\d+\.html$/i.test(url)) return 30;
  if (/[?&]postingID=\d+/i.test(url)) return 20;
  if (isLegacyBrokenListingUrl(url)) return 0;
  return 10;
}

export function dedupeSearchListingUrls(urls) {
  const byPostingId = new Map();
  const extras = [];

  for (const rawUrl of urls || []) {
    const url = normalizeSearchListingUrl(rawUrl);
    if (!url || isLegacyBrokenListingUrl(url)) continue;

    const postingId = extractPostingIdFromUrl(url);
    if (postingId) {
      const prev = byPostingId.get(postingId);
      if (!prev || listingUrlPriority(url) > listingUrlPriority(prev)) {
        byPostingId.set(postingId, url);
      }
      continue;
    }

    if (!extras.includes(url)) extras.push(url);
  }

  return [...byPostingId.values(), ...extras];
}

export function mergeSearchListingUrls(...groups) {
  return dedupeSearchListingUrls(groups.flat().filter(Boolean));
}
