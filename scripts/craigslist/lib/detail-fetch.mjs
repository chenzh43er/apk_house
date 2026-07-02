import { craigslistFetch, isBlockedResponse } from './http.mjs';

function decodeHtml(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractSection(html, id) {
  const re = new RegExp(`<section[^>]*id="${id}"[^>]*>([\\s\\S]*?)</section>`, 'i');
  const match = html.match(re);
  return match ? match[1] : '';
}

function stripTags(html) {
  return decodeHtml(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function extractAttrMap(html) {
  const attrs = {};
  const re = /<p>\s*<span class="attrgroup">([\s\S]*?)<\/span>\s*<\/p>/gi;
  let groupMatch;
  while ((groupMatch = re.exec(html))) {
    const spanRe = /<span>([^<:]+):\s*<b>([\s\S]*?)<\/b>\s*<\/span>/gi;
    let spanMatch;
    while ((spanMatch = spanRe.exec(groupMatch[1]))) {
      attrs[spanMatch[1].trim().toLowerCase()] = stripTags(spanMatch[2]);
    }
  }
  return attrs;
}

function extractImages(html) {
  const urls = [];
  const re = /<img[^>]+src="([^"]+)"/gi;
  let match;
  while ((match = re.exec(html))) {
    const url = match[1];
    if (url.includes('images.craigslist.org')) urls.push(url);
  }
  return [...new Set(urls)];
}

export async function fetchListingDetail(url, options = {}) {
  const { res, text } = await craigslistFetch(url, {
    referer: url.replace(/\/[^/]+\.html$/, '/'),
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    mode: 'document',
    proxy: options.proxy
  });

  if (isBlockedResponse(res.status, text)) {
    throw new Error(`Detail page blocked (HTTP ${res.status}) for ${url}`);
  }

  if (!res.ok) {
    throw new Error(`Detail page HTTP ${res.status} for ${url}`);
  }

  const postingBody = extractSection(text, 'postingbody');
  const description = stripTags(postingBody);
  const attrs = extractAttrMap(text);
  const imageUrls = extractImages(text);

  return {
    description,
    phone: attrs.phone || '',
    baths: attrs.bathrooms ? Number.parseFloat(attrs.bathrooms) : null,
    beds: attrs.bedrooms ? Number.parseFloat(attrs.bedrooms) : null,
    sqft: attrs['sqft'] ? Number.parseFloat(attrs['sqft']) : null,
    image_urls: imageUrls
  };
}

export async function enrichListingsWithDetails(listings, options = {}) {
  const delayMs = options.delayMs ?? 1500;
  const max = options.max ?? listings.length;
  const enriched = [];

  for (let i = 0; i < Math.min(listings.length, max); i += 1) {
    const listing = listings[i];
    try {
      const detail = await fetchListingDetail(listing.url, options);
      enriched.push({
        ...listing,
        ...detail,
        beds: detail.beds ?? listing.beds,
        sqft: detail.sqft ?? listing.sqft,
        baths: detail.baths ?? listing.baths
      });
    } catch (error) {
      enriched.push({
        ...listing,
        detail_error: error.message
      });
    }

    if (i < listings.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return enriched;
}
