import { randomUUID } from 'node:crypto';

function nowStamp() {
  const d = new Date();
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

const HOUSING_LABELS = {
  apartment: 'Apartment',
  room: 'Room',
  house: 'House',
  condo: 'Condo',
  townhouse: 'Townhouse'
};

function buildFallbackText(listing, geo) {
  const parts = [
    listing.title,
    listing.room ? `${listing.room} bed` : '',
    listing.area ? `${listing.area} sqft` : '',
    geo?.display_district ? `Located in ${geo.display_district}, ${geo.display_state || ''}`.trim() : ''
  ].filter(Boolean);
  return `${parts.join('. ')}.`.replace(/\.\./g, '.');
}

export function mapListingToHouseGer(listing, context) {
  const geo = listing.geo || context.geo || null;
  const displayState = geo?.display_state || context.displayState || '';
  const displayDistrict = geo?.display_district || context.displayDistrict || '';
  const displayCity = geo?.display_city || context.displayCity || '';
  const housingType = listing.housing_type || 'apartment';
  const imageFiles = listing.image_files || [];
  const now = nowStamp();
  const street = listing.location || geo?.street || '';
  const msg = listing.description || buildFallbackText(listing, geo);
  const info = listing.info || msg;

  const addressJson = geo?.address_json || {
    source: 'craigslist',
    posting_id: listing.posting_id,
    url: listing.url,
    query: listing.geocode_query || listing.full_address || street
  };
  addressJson.source = 'craigslist';
  addressJson.url = listing.url;
  addressJson.posting_id = listing.posting_id;

  return {
    id: randomUUID(),
    name: listing.title || `Listing ${listing.posting_id}`,
    location: street,
    mainpic: listing.mainpic,
    msg,
    tel: listing.phone || '',
    status: 1,
    pics: JSON.stringify(imageFiles),
    detail_loca1: displayState,
    detail_loca2: displayCity,
    detail_loca3: displayDistrict,
    room: String(listing.room ?? 1),
    area: listing.area ? String(listing.area) : '',
    loft: String(listing.loft ?? 1),
    supplier: 'Craigslist',
    price: listing.price_text || (listing.price > 0 ? `$${listing.price}` : 'Contact for price'),
    ver: HOUSING_LABELS[housingType] || 'Apartment',
    info,
    statetype: housingType,
    street,
    district: displayDistrict,
    city: displayCity,
    state: displayState,
    country: 'United States',
    county: displayCity,
    display_name: geo?.display_name || listing.full_address || street,
    address_json: JSON.stringify(addressJson),
    display_state: displayState,
    display_city: displayCity,
    display_district: displayDistrict,
    pic_count: imageFiles.length,
    pics_jsonStr: JSON.stringify(imageFiles),
    cdkey: `cl-${listing.posting_id || randomUUID()}`,
    create_time: now,
    update_time: now,
    _source: {
      craigslist_id: listing.posting_id,
      url: listing.url,
      image_urls: listing.image_urls || [],
      image_dir: listing.mainpic
    }
  };
}

export function mapProcessedResults(results) {
  return results.map(({ craigslist, house_ger }) => ({
    craigslist,
    house_ger
  }));
}
