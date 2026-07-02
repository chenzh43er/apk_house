import { decodeSearchResponse } from './decode-listing.mjs';

const HREF_PATTERNS = [
  /href="(https:\/\/www\.craigslist\.org\/view\/d\/[^"?#]+)"/gi,
  /href="(https:\/\/[a-z0-9-]+\.craigslist\.org\/[^"]*\/d\/[^"?#]+)"/gi,
  /href="(https:\/\/[a-z0-9-]+\.craigslist\.org\/[a-z]+\/[^"]+\/\d+\.html)"/gi,
  /href="(\/[a-z0-9-]+\/d\/[^"?#]+)"/gi,
  /href="(\/[a-z0-9-]+\/[^"]+\/\d+\.html)"/gi
];

export function normalizeSearchListingUrl(rawUrl, city = '') {
  if (!rawUrl) return '';

  let url = String(rawUrl)
    .replace(/&amp;/g, '&')
    .trim()
    .split('?')[0]
    .split('#')[0];

  if (url.startsWith('//')) url = `https:${url}`;
  if (url.startsWith('/')) {
    const host = city ? `https://${city}.craigslist.org` : 'https://www.craigslist.org';
    url = `${host}${url}`;
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

export function mergeSearchListingUrls(...groups) {
  return [...new Set(groups.flat().filter(Boolean))];
}
