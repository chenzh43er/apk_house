import { US_STATE_ABBR } from './constants.mjs';
import { isValidLocalityName, sanitizeLocality } from './locality.mjs';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const US_ADDRESS_RE = /\b(\d[\w\s./#-]+,\s*[\w\s.'-]+,\s*([A-Z]{2})(?:\s+(\d{5}(?:-\d{4})?))?)\b/;
const INDEPENDENT_CITIES = new Set([
  'san francisco', 'baltimore', 'st. louis', 'carson city', 'st louis'
]);

const US_STATE_NAME_TO_ABBR = Object.fromEntries(
  Object.entries(US_STATE_ABBR).map(([abbr, name]) => [name.toLowerCase(), abbr])
);

const cache = new Map();
let lastRequestAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttle() {
  const wait = Math.max(0, 1100 - (Date.now() - lastRequestAt));
  if (wait) await sleep(wait);
  lastRequestAt = Date.now();
}

export function parseUsAddressComponents(text) {
  const match = String(text || '').match(US_ADDRESS_RE);
  if (!match) return null;

  const full = match[1].trim();
  const parts = full.split(',').map((part) => part.trim()).filter(Boolean);
  const stateAbbr = match[2];
  const zip = match[3] || '';

  return {
    street: parts[0] || '',
    city: parts[1] || '',
    stateAbbr,
    zip,
    full
  };
}

export function countyLabel(city) {
  if (!city) return '';
  if (/county$/i.test(city)) return city;
  if (INDEPENDENT_CITIES.has(city.toLowerCase())) return city;
  return `${city} County`;
}

export function buildGeocodeQuery(detail, context = {}) {
  const state = context.displayState || '';
  const abbr = US_STATE_NAME_TO_ABBR[state.toLowerCase()] || '';
  const locality = sanitizeLocality(detail.locality);
  const parsed = parseUsAddressComponents(detail.full_address || detail.geocode_query || '');

  if (parsed?.city && isValidLocalityName(parsed.city)) {
    return parsed.full;
  }

  const street = detail.location || detail.full_address?.split(',')[0]?.trim() || '';
  const parts = [street].filter(Boolean);
  if (locality) parts.push(locality);
  if (abbr) parts.push(abbr);
  else if (state) parts.push(state);

  return parts.join(', ').trim();
}

export function parseUsAddressFallback(fullAddress, defaultState = '', hints = {}) {
  if (!fullAddress && !hints.locality) return null;

  const parsed = parseUsAddressComponents(fullAddress);
  const street = parsed?.street || fullAddress.split(',')[0]?.trim() || fullAddress || '';
  const city = sanitizeLocality(parsed?.city) || sanitizeLocality(hints.locality) || '';
  const abbr = parsed?.stateAbbr || US_STATE_NAME_TO_ABBR[(defaultState || '').toLowerCase()] || '';
  const displayState = US_STATE_ABBR[abbr] || defaultState || '';
  const displayDistrict = city;
  const displayCity = '';
  const displayName = parsed?.full || [street, city, abbr].filter(Boolean).join(', ');

  return {
    street,
    display_state: displayState,
    display_city: displayCity,
    display_district: displayDistrict,
    display_name: displayName,
    lat: null,
    lon: null,
    address_json: {
      source: 'craigslist',
      display_name: displayName,
      address: {
        road: street,
        city: displayDistrict,
        county: displayCity,
        state: displayState,
        postcode: parsed?.zip || '',
        country: 'United States',
        country_code: 'us'
      }
    }
  };
}

function mapNominatimResult(hit, query) {
  const addr = hit.address || {};
  const state = addr.state || '';
  const county = addr.county || addr.city_district || '';
  const district = addr.city || addr.town || addr.village || addr.suburb || addr.neighbourhood || '';
  const streetParts = [addr.house_number, addr.road].filter(Boolean);
  const street = streetParts.join(' ') || query.split(',')[0]?.trim() || query;
  const displayDistrict = district || county.replace(/\s+County$/i, '') || '';
  const displayCity = county || (displayDistrict ? countyLabel(displayDistrict) : '');

  return {
    street,
    display_state: state,
    display_city: displayCity,
    display_district: displayDistrict,
    display_name: hit.display_name || query,
    lat: hit.lat ? Number.parseFloat(hit.lat) : null,
    lon: hit.lon ? Number.parseFloat(hit.lon) : null,
    address_json: {
      place_id: hit.place_id,
      licence: hit.licence || 'Data © OpenStreetMap contributors, ODbL 1.0. http://osm.org/copyright',
      lat: hit.lat,
      lon: hit.lon,
      class: hit.class,
      type: hit.type,
      place_rank: hit.place_rank,
      importance: hit.importance,
      addresstype: hit.addresstype,
      name: hit.name,
      display_name: hit.display_name,
      address: addr,
      boundingbox: hit.boundingbox
    }
  };
}

async function fetchNominatim(query, options = {}) {
  await throttle();

  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '1',
    countrycodes: options.countryCode || 'us'
  });

  const res = await fetch(`${NOMINATIM}?${params}`, {
    headers: {
      'User-Agent': options.userAgent || 'apk-house-craigslist-import/1.0 (house listing geocode)',
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(options.timeoutMs || 15000)
  });

  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);

  const rows = await res.json();
  return rows?.[0] || null;
}

async function lookupCounty(locality, state, options = {}) {
  if (!locality) return '';

  const abbr = US_STATE_NAME_TO_ABBR[(state || '').toLowerCase()] || state;
  const query = abbr ? `${locality}, ${abbr}` : locality;
  const cacheKey = `county:${query}`.toLowerCase();
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  try {
    const hit = await fetchNominatim(query, options);
    const county = hit?.address?.county || '';
    cache.set(cacheKey, county);
    return county;
  } catch {
    cache.set(cacheKey, '');
    return '';
  }
}

async function enrichCounty(mapped, options = {}) {
  if (!mapped?.display_district) return mapped;

  const hasCounty = mapped.display_city && /county$/i.test(mapped.display_city)
    && mapped.display_city.toLowerCase() !== countyLabel(mapped.display_district).toLowerCase();

  if (hasCounty) return mapped;

  const county = await lookupCounty(mapped.display_district, mapped.display_state, options);
  if (county) {
    mapped.display_city = county;
    mapped.address_json ??= { address: {} };
    mapped.address_json.address ??= {};
    mapped.address_json.address.county = county;
    return mapped;
  }

  if (!mapped.display_city) {
    mapped.display_city = countyLabel(mapped.display_district);
    mapped.address_json ??= { address: {} };
    mapped.address_json.address ??= {};
    mapped.address_json.address.county = mapped.display_city;
  }

  return mapped;
}

export async function geocodeAddress(query, options = {}) {
  const key = query.trim().toLowerCase();
  if (cache.has(key)) return cache.get(key);

  const hints = { locality: options.locality || '' };

  try {
    const hit = await fetchNominatim(query, options);
    let mapped = hit
      ? mapNominatimResult(hit, query)
      : parseUsAddressFallback(query, options.defaultState || '', hints);

    if (mapped && !mapped.display_district && hints.locality) {
      mapped = parseUsAddressFallback(query, options.defaultState || '', hints);
    }

    mapped = await enrichCounty(mapped, options);
    cache.set(key, mapped);
    return mapped;
  } catch {
    let fallback = parseUsAddressFallback(query, options.defaultState || '', hints);
    fallback = await enrichCounty(fallback, options);
    cache.set(key, fallback);
    return fallback;
  }
}
