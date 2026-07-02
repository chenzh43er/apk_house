import fs from 'node:fs';
import path from 'node:path';
import { extractCityFromUrl, pickLocality, sanitizeLocality } from './locality.mjs';

function decodeHtml(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function normalizeHtml(html) {
  return String(html || '')
    .replace(/<sup[^>]*>([\s\S]*?)<\/sup>/gi, '$1')
    .replace(/<sub[^>]*>([\s\S]*?)<\/sub>/gi, '$1');
}

function stripTags(html) {
  return decodeHtml(normalizeHtml(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function extractSection(html, id) {
  const re = new RegExp(`<section[^>]*id="${id}"[^>]*>([\\s\\S]*?)</section>`, 'i');
  const match = html.match(re);
  return match ? match[1] : '';
}

function extractInnerHtml(html, re) {
  const match = html.match(re);
  return match ? match[1] : '';
}

function extractTitleText(html) {
  const titleOnly = extractInnerHtml(html, /<span[^>]*id=["']titletextonly["'][^>]*>([\s\S]*?)<\/span>/i);
  if (titleOnly) return stripTags(titleOnly);

  const postingTitle = extractInnerHtml(html, /<span[^>]*class=["'][^"']*postingtitletext[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
  if (postingTitle) {
    const cleaned = postingTitle
      .replace(/<span[^>]*class=["'][^"']*price["'][^>]*>[\s\S]*?<\/span>/gi, '')
      .replace(/<span[^>]*class=["'][^"']*housing["'][^>]*>[\s\S]*?<\/span>/gi, '')
      .replace(/<span[^>]*id=["']titletextonly["'][^>]*>[\s\S]*?<\/span>/gi, (m) => m);
    const fromNested = cleaned.match(/<span[^>]*id=["']titletextonly["'][^>]*>([\s\S]*?)<\/span>/i);
    if (fromNested) return stripTags(fromNested[1]);
    return stripTags(cleaned);
  }

  const h1 = extractInnerHtml(html, /<h1[^>]*class=["'][^"']*postingtitle[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i);
  return h1 ? stripTags(h1) : '';
}

function extractPrice(html) {
  const priceHtml = extractInnerHtml(html, /<span[^>]*class=["'][^"']*price["'][^>]*>([\s\S]*?)<\/span>/i);
  if (priceHtml) {
    const text = stripTags(priceHtml);
    const match = text.match(/\$\s*([\d,]+)/);
    if (match) {
      return {
        price: Number.parseInt(match[1].replace(/,/g, ''), 10),
        price_text: `$${match[1]}`
      };
    }
  }

  const fallback = stripTags(extractInnerHtml(html, /<span[^>]*class=["'][^"']*postingtitletext[^"']*["'][^>]*>([\s\S]*?)<\/span>/i));
  const match = fallback.match(/\$\s*([\d,]+)/);
  if (match) {
    return {
      price: Number.parseInt(match[1].replace(/,/g, ''), 10),
      price_text: `$${match[1]}`
    };
  }

  return { price: -1, price_text: 'Contact for price' };
}

function parseBedroomCount(text) {
  const match = String(text || '').match(/(\d+(?:\.\d+)?)\s*(?:br|bed|bedroom)\b/i);
  return match ? Number.parseFloat(match[1]) : null;
}

function parseSqft(text) {
  const match = String(text || '').match(/(\d[\d,]*)\s*(?:ft2|ft\u00b2|sqft|sf)\b/i);
  return match ? Number.parseInt(match[1].replace(/,/g, ''), 10) : null;
}

function parseBathroomCount(text) {
  const match = String(text || '').match(/(\d+(?:\.\d+)?)\s*ba\b/i);
  return match ? Number.parseFloat(match[1]) : null;
}

function parseFloor(text) {
  const match = String(text || '').match(/(\d+(?:\.\d+)?)(?:st|nd|rd|th)?\s*floor\b/i);
  return match ? String(match[1]) : '';
}

function extractHousingMetrics(html) {
  const housingHtml = extractInnerHtml(html, /<span[^>]*class=["'][^"']*housing["'][^>]*>([\s\S]*?)<\/span>/i);
  const text = stripTags(housingHtml);
  return {
    beds: parseBedroomCount(text),
    sqft: parseSqft(text),
    baths: parseBathroomCount(text),
    floor: parseFloor(text)
  };
}

function extractAttrGroupMetrics(html) {
  const metrics = { beds: null, sqft: null, baths: null, floor: '' };
  const groupRe = /<div[^>]*class=["'][^"']*attrgroup[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
  let groupMatch;

  while ((groupMatch = groupRe.exec(html))) {
    const spanRe = /<span[^>]*class=["'][^"']*attr[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi;
    let spanMatch;
    while ((spanMatch = spanRe.exec(groupMatch[1]))) {
      const text = stripTags(spanMatch[1]);
      metrics.beds ??= parseBedroomCount(text);
      metrics.sqft ??= parseSqft(text);
      metrics.baths ??= parseBathroomCount(text);
      if (!metrics.floor) metrics.floor = parseFloor(text);

      const brBa = text.match(/(\d+(?:\.\d+)?)\s*BR\s*\/\s*(\d+(?:\.\d+)?)\s*Ba/i);
      if (brBa) {
        metrics.beds ??= Number.parseFloat(brBa[1]);
        metrics.baths ??= Number.parseFloat(brBa[2]);
      }
    }
  }

  return metrics;
}

function extractAttrMap(html) {
  const attrs = {};
  const groupRe = /<div[^>]*class=["'][^"']*attrgroup[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
  let groupMatch;

  while ((groupMatch = groupRe.exec(html))) {
    const labeledRe = /<span[^>]*>([^<:]+):\s*<b>([\s\S]*?)<\/b>\s*<\/span>/gi;
    let labeledMatch;
    while ((labeledMatch = labeledRe.exec(groupMatch[1]))) {
      attrs[labeledMatch[1].trim().toLowerCase()] = stripTags(labeledMatch[2]);
    }
  }

  return attrs;
}

function extractMapAddress(html) {
  const patterns = [
    /<div[^>]*class="[^"]*mapaddress[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<h2[^>]*>([\s\S]*?)<\/h2>/i
  ];
  for (const re of patterns) {
    const match = html.match(re);
    if (!match) continue;
    const text = stripTags(match[1]);
    if (/\d/.test(text) && /(?:avenue|ave|street|st|road|rd|blvd|drive|dr|lane|ln|way|court|ct)/i.test(text)) {
      return text;
    }
  }
  return '';
}

function extractStreetLine(fullAddress) {
  if (!fullAddress) return '';
  return fullAddress.split(',')[0]?.trim() || fullAddress.trim();
}

function extractLocalityFromTitle(html) {
  const postingTitle = extractInnerHtml(html, /<span[^>]*class=["'][^"']*postingtitletext[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
  if (!postingTitle) return '';

  const parenMatch = postingTitle.match(/\(([^)]+)\)\s*(?:<\/span>\s*)?$/i);
  if (parenMatch) return stripTags(parenMatch[1]);

  const text = stripTags(postingTitle);
  const endMatch = text.match(/\(([^)]+)\)\s*$/);
  return endMatch ? endMatch[1].trim() : '';
}

function extractUsAddressFromText(text) {
  const patterns = [
    /\b(\d[\w\s./#-]+,\s*[\w\s.'-]+,\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?)\b/,
    /\b(\d[\w\s./#-]+,\s*[\w\s.'-]+,\s*[A-Z]{2})\b/
  ];

  for (const re of patterns) {
    const match = String(text || '').match(re);
    if (match) return match[1].trim();
  }

  return '';
}

function extractCityFromAddress(fullAddress) {
  if (!fullAddress?.includes(',')) return '';
  return sanitizeLocality(fullAddress.split(',').map((part) => part.trim())[1] || '');
}

function buildFullAddress(street, locality, stateAbbr = '') {
  const parts = [street, locality, stateAbbr].map((part) => String(part || '').trim()).filter(Boolean);
  return parts.join(', ');
}

function toFullImageUrl(url) {
  if (!url) return '';
  return url.startsWith('//') ? `https:${url}` : url;
}

function extractImageUrls(html, htmlFilePath = '') {
  const urls = new Set();
  const patterns = [
    /href="(https:\/\/images\.craigslist\.org\/[^"]+)"/gi,
    /src="(https:\/\/images\.craigslist\.org\/[^"]+)"/gi,
    /src="([^"]*\/[^"]+\.(?:jpg|jpeg|webp|png))"/gi
  ];

  for (const re of patterns) {
    let match;
    while ((match = re.exec(html))) {
      const url = match[1];
      if (url.startsWith('http')) {
        urls.add(toFullImageUrl(url));
      } else if (htmlFilePath) {
        const local = path.resolve(path.dirname(htmlFilePath), url);
        if (fs.existsSync(local)) urls.add(local);
      }
    }
  }

  return [...urls].filter((url) => !url.includes('thumb') && !url.includes('icon'));
}

function extractPostId(html, url = '') {
  const fromHtml = html.match(/post id:\s*(\d+)/i);
  if (fromHtml) return fromHtml[1];
  const fromUrl = url.match(/\/(\d+)\.html(?:\?|$)/);
  if (fromUrl) return fromUrl[1];
  const slugMatch = url.match(/\/view\/d\/[^/]+\/([^/?#]+)/);
  return slugMatch ? slugMatch[1] : '';
}

function inferHousingType(title, attrs, html) {
  const text = `${title} ${Object.values(attrs).join(' ')} ${html}`.toLowerCase();
  if (/\broom\b/.test(title.toLowerCase())) return 'room';
  if (text.includes('condo')) return 'condo';
  if (text.includes('townhouse')) return 'townhouse';
  if (text.includes('house')) return 'house';
  return 'apartment';
}

function pickFirstNumber(...values) {
  for (const value of values) {
    if (value != null && Number.isFinite(value)) return value;
  }
  return null;
}

export function parseDetailHtml(html, options = {}) {
  const url = options.url || '';
  const normalized = normalizeHtml(html);
  const title = extractTitleText(normalized);
  const { price, price_text: priceText } = extractPrice(normalized);
  const housingMetrics = extractHousingMetrics(normalized);
  const attrMetrics = extractAttrGroupMetrics(normalized);
  const attrs = extractAttrMap(normalized);
  const postingBody = extractSection(normalized, 'postingbody');
  const description = stripTags(postingBody);
  const localityFromTitle = extractLocalityFromTitle(normalized);
  let fullAddress = extractMapAddress(normalized);

  if (!fullAddress.includes(',') && description) {
    const fromDesc = extractUsAddressFromText(description);
    if (fromDesc) fullAddress = fromDesc;
  }

  const street = extractStreetLine(fullAddress);
  const locality = pickLocality(
    extractCityFromAddress(fullAddress),
    localityFromTitle,
    attrs.city,
    extractCityFromUrl(url)
  );

  if (locality && !extractCityFromAddress(fullAddress)) {
    fullAddress = buildFullAddress(street, locality);
  }

  const imageUrls = extractImageUrls(normalized, options.htmlFilePath);
  const postId = extractPostId(normalized, url);

  const beds = pickFirstNumber(
    attrMetrics.beds,
    housingMetrics.beds,
    attrs.bedrooms ? Number.parseFloat(attrs.bedrooms) : null
  );
  const sqft = pickFirstNumber(
    attrMetrics.sqft,
    housingMetrics.sqft,
    attrs['sqft'] ? Number.parseFloat(attrs['sqft']) : null
  );
  const baths = pickFirstNumber(
    attrMetrics.baths,
    housingMetrics.baths,
    attrs.bathrooms ? Number.parseFloat(attrs.bathrooms) : null
  );
  const floor = attrMetrics.floor || housingMetrics.floor || attrs.floor || '';

  return {
    url,
    posting_id: postId,
    title,
    price,
    price_text: priceText,
    room: beds != null ? beds : 1,
    area: sqft != null ? String(sqft) : '',
    loft: floor ? String(floor) : '1',
    location: street,
    full_address: fullAddress,
    locality,
    geocode_query: buildFullAddress(street, locality) || street,
    description,
    phone: attrs.phone || '',
    image_urls: imageUrls,
    housing_type: inferHousingType(title, attrs, normalized),
    baths
  };
}
