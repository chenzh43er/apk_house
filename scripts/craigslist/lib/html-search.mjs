import { craigslistFetch, isBlockedResponse } from './http.mjs';
import fs from 'node:fs';

function postingIdFromUrl(url) {
  const match = String(url || '').match(/\/(\d+)\.html(?:\?|$)/);
  return match ? match[1] : '';
}

function firstImage(item) {
  const images = item?.image;
  if (Array.isArray(images)) return images.filter(Boolean);
  if (typeof images === 'string') return [images];
  return [];
}

function parsePrice(offers) {
  const raw = offers?.price;
  const price = raw != null ? Number.parseFloat(String(raw).replace(/,/g, '')) : -1;
  const currency = offers?.priceCurrency || 'USD';
  const priceText = Number.isFinite(price) && price > 0 ? `$${price.toLocaleString('en-US')}` : 'Contact for price';
  return { price: Number.isFinite(price) ? price : -1, price_text: priceText, currency };
}

function parseAddress(offers) {
  const address = offers?.availableAtOrFrom?.address || offers?.availableAtOrFrom || {};
  return {
    area: address.addressLocality || address.addressRegion || '',
    subarea: address.addressNeighborhood || address.streetAddress || '',
    lat: address.geo?.latitude ? Number.parseFloat(address.geo.latitude) : null,
    lon: address.geo?.longitude ? Number.parseFloat(address.geo.longitude) : null
  };
}

function extractJsonLd(html) {
  const match = html.match(/<script[^>]+id=["']ld_searchpage_results["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  return JSON.parse(match[1]);
}

function extractResultLinks(html) {
  const links = [];
  const re = /href="(\/[^"]+\/\d+\.html)"/gi;
  let match;
  while ((match = re.exec(html))) {
    links.push(match[1]);
  }
  return [...new Set(links)];
}

function mapJsonLdItem(entry, context) {
  const item = entry?.item || entry;
  if (!item?.name && !item?.url) return null;

  const offers = item.offers || {};
  const { price, price_text } = parsePrice(offers);
  const location = parseAddress(offers);
  const url = item.url?.startsWith('http')
    ? item.url
    : `https://${context.city}.craigslist.org${item.url || ''}`;
  const postingId = postingIdFromUrl(url);
  const images = firstImage(item);

  return {
    posting_id: postingId || String(entry.position || item.name),
    title: item.name || '',
    price,
    price_text,
    beds: null,
    sqft: null,
    posted_at: item.datePosted || null,
    url,
    slug: '',
    lat: location.lat,
    lon: location.lon,
    area: location.area,
    subarea: location.subarea,
    images,
    image_urls: images,
    category_id: null
  };
}

export function buildHtmlSearchUrl(options) {
  const city = options.city;
  const category = options.category || 'apa';
  const params = new URLSearchParams();

  if (options.query) params.set('query', options.query);
  if (options.postal) params.set('postal', options.postal);
  if (options.searchDistance) params.set('search_distance', String(options.searchDistance));
  if (options.hasPic) params.set('hasPic', '1');
  if (options.sort) params.set('sort', options.sort);
  if (options.minPrice != null) params.set('min_price', String(options.minPrice));
  if (options.maxPrice != null) params.set('max_price', String(options.maxPrice));

  const qs = params.toString();
  return `https://${city}.craigslist.org/search/${category}${qs ? `?${qs}` : ''}`;
}

export async function fetchHtmlSearchListings(options) {
  const city = options.city;
  const url = buildHtmlSearchUrl(options);
  let text;
  let proxyUrl = options.proxy || '';

  if (options.htmlFile) {
    text = fs.readFileSync(options.htmlFile, 'utf8');
  } else {
    const response = await craigslistFetch(url, {
      referer: `https://${city}.craigslist.org/`,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      mode: 'document',
      proxy: options.proxy
    });
    text = response.text;
    proxyUrl = response.proxyUrl;

    if (isBlockedResponse(response.res.status, text)) {
      const err = new Error(`Craigslist HTML HTTP ${response.res.status}: blocked`);
      err.blocked = true;
      err.proxyUrl = proxyUrl;
      throw err;
    }
  }

  let jsonLd;
  try {
    jsonLd = extractJsonLd(text);
  } catch (error) {
    throw new Error(`Failed to parse JSON-LD from HTML search page: ${error.message}`);
  }

  const context = { city, category: options.category || 'apa' };
  let listings = [];

  if (jsonLd?.itemListElement?.length) {
    listings = jsonLd.itemListElement
      .map((entry) => mapJsonLdItem(entry, context))
      .filter(Boolean);
  }

  if (!listings.length) {
    const links = extractResultLinks(text).slice(0, options.max || 120);
    listings = links.map((href) => {
      const fullUrl = `https://${city}.craigslist.org${href}`;
      return {
        posting_id: postingIdFromUrl(fullUrl),
        title: '',
        price: -1,
        price_text: 'Contact for price',
        beds: null,
        sqft: null,
        posted_at: null,
        url: fullUrl,
        slug: '',
        lat: null,
        lon: null,
        area: '',
        subarea: '',
        images: [],
        image_urls: [],
        category_id: null
      };
    }).filter((item) => item.posting_id);
  }

  const max = options.max ?? listings.length;
  return listings.slice(0, max);
}
