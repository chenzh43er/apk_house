function isTaggedBlock(value) {
  return Array.isArray(value) && value.length >= 2 && typeof value[0] === 'number';
}

function findTitle(item) {
  for (let i = item.length - 1; i >= 0; i -= 1) {
    const value = item[i];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function parseLocationToken(token, decode) {
  if (!token || typeof token !== 'string') {
    return { area: '', subarea: '', lat: null, lon: null };
  }

  const [locPart, latStr, lonStr] = token.split('~');
  const locIdx = Number.parseInt(locPart.split(':')[0], 10);
  const locationRow = Number.isFinite(locIdx) ? decode?.locations?.[locIdx] : null;
  const area = locationRow?.[1] || '';
  const subarea = locationRow?.[2] || '';

  return {
    area,
    subarea,
    lat: latStr ? Number.parseFloat(latStr) : null,
    lon: lonStr ? Number.parseFloat(lonStr) : null
  };
}

export function decodeListing(item, decode, context) {
  const tagged = {};
  for (const value of item) {
    if (!isTaggedBlock(value)) continue;
    tagged[value[0]] = value.length === 2 ? value[1] : value.slice(1);
  }

  const postingId = item[0];
  const postedOffset = item[1];
  const price = item[3];
  const location = parseLocationToken(item[4], decode);
  const housingMeta = Array.isArray(tagged[5]) ? tagged[5] : [];
  const beds = housingMeta[0] ?? null;
  const sqft = housingMeta[1] ?? null;
  const slug = Array.isArray(tagged[6]) ? tagged[6][0] : (tagged[6] || '');
  const images = Array.isArray(tagged[4]) ? tagged[4] : [];
  const priceTextRaw = tagged[10];
  const priceText = Array.isArray(priceTextRaw)
    ? priceTextRaw[0]
    : (priceTextRaw || (price > 0 ? `$${price}` : 'Contact for price'));
  const title = findTitle(item);

  const minPostedDate = decode?.minPostedDate || 0;
  const postedAt = postedOffset
    ? new Date((minPostedDate + postedOffset) * 1000).toISOString()
    : null;

  const city = context.city;
  const category = context.category;
  const url = slug
    ? `https://${city}.craigslist.org/${category}/${slug}/${postingId}.html`
    : `https://${city}.craigslist.org/search/${category}?postingID=${postingId}`;

  return {
    posting_id: String(postingId),
    title,
    price,
    price_text: priceText,
    beds,
    sqft,
    posted_at: postedAt,
    url,
    slug,
    lat: location.lat,
    lon: location.lon,
    area: location.area,
    subarea: location.subarea,
    images: Array.isArray(images) ? images : [],
    image_urls: Array.isArray(images) ? images.filter((url) => typeof url === 'string') : [],
    category_id: item[2] ?? null
  };
}

export function decodeSearchResponse(payload, context) {
  const decode = payload?.data?.decode || {};
  const items = payload?.data?.items || [];

  return items.map((item) => decodeListing(item, decode, context));
}
