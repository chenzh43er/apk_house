import fs from 'node:fs';
import path from 'node:path';
import { normalizeSearchListingUrl, extractPostingIdFromUrl } from './search-urls.mjs';

export function listingKeyFromUrl(url) {
  const normalized = normalizeSearchListingUrl(String(url || '').trim());
  if (!normalized) return '';

  const postingId = extractPostingIdFromUrl(normalized);
  if (postingId) return `cl-${postingId}`;

  const view = normalized.match(/\/view\/d\/[^/]+\/([^/?#]+)/i)
    || normalized.match(/\/[a-z0-9-]+\/d\/[^/]+\/([^/?#]+)/i);
  if (view) return `url:${view[1].toLowerCase()}`;

  return `url:${normalized.toLowerCase()}`;
}

export function listingKeyFromResult(item) {
  const cdkey = item?.house_ger?.cdkey;
  if (cdkey) return String(cdkey);

  const postingId = item?.craigslist?.posting_id;
  if (postingId && /^\d+$/.test(String(postingId))) return `cl-${postingId}`;

  return listingKeyFromUrl(item?.craigslist?.url || item?.url);
}

export function dedupeListingResults(listings) {
  const seen = new Set();
  const unique = [];

  for (const item of listings || []) {
    const key = listingKeyFromResult(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  return unique;
}

export function loadSeenKeysFromListings(listings) {
  const seen = new Set();
  for (const item of listings || []) {
    rememberListingKeys(seen, item);
  }
  return seen;
}

export function loadSeenKeysFromBatchDir(outputDir) {
  const seen = new Set();
  if (!outputDir || !fs.existsSync(outputDir)) return seen;

  for (const file of fs.readdirSync(outputDir)) {
    if (!/^[A-Z]{2}-.+\.json$/i.test(file)) continue;
    try {
      const payload = JSON.parse(fs.readFileSync(path.join(outputDir, file), 'utf8'));
      for (const key of loadSeenKeysFromListings(payload.listings)) {
        seen.add(key);
      }
    } catch {
      // ignore broken region files
    }
  }

  return seen;
}

export function filterNewUrls(urls, seenKeys) {
  const fresh = [];
  let skipped = 0;

  for (const url of urls || []) {
    const key = listingKeyFromUrl(url);
    if (key && seenKeys.has(key)) {
      skipped += 1;
      continue;
    }
    fresh.push(url);
  }

  return { fresh, skipped };
}

export function rememberListingKeys(seenKeys, itemOrUrl) {
  if (!seenKeys) return;

  if (typeof itemOrUrl === 'string') {
    const key = listingKeyFromUrl(itemOrUrl);
    if (key) seenKeys.add(key);
    return;
  }

  const url = itemOrUrl?.craigslist?.url || itemOrUrl?.url;
  const urlKey = listingKeyFromUrl(url);
  const resultKey = listingKeyFromResult(itemOrUrl);
  if (urlKey) seenKeys.add(urlKey);
  if (resultKey) seenKeys.add(resultKey);
}
