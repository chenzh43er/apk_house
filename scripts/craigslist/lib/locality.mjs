const URL_CITY_STOP_WORDS = new Set([
  'updated', 'bedroom', 'bedrooms', 'bathroom', 'bathrooms', 'apartment', 'apartments',
  'house', 'condo', 'room', 'rooms', 'studio', 'newly', 'remodeled', 'spacious', 'large',
  'ceiling', 'fan', 'dishwasher', 'garage', 'parking', 'pool', 'gym', 'luxury', 'modern',
  'cozy', 'charming', 'beautiful', 'private', 'shared', 'furnished', 'unfurnished',
  'available', 'move', 'free', 'month', 'rent', 'lease', 'bed', 'bath', 'br', 'ba',
  'one', 'two', 'three', '1br', '2br', '3br', '4br', 'prime', 'location', 'great',
  'near', 'top', 'floor', 'level', 'corner', 'unit', 'in', 'the', 'a', 'an', 'with',
  'coming', 'soon', 'open', 'call', 'now', 'view', 'walk', 'min', 'mins', 'block'
]);

export function isValidLocalityName(name) {
  const value = String(name || '').trim();
  if (!value || value.length < 2) return false;
  if (/^#/.test(value)) return false;
  if (/\bnear\b/i.test(value)) return false;
  if (/^(?:apt|unit|ste|suite)\b/i.test(value)) return false;
  if (!/[A-Za-z]{2,}/.test(value)) return false;
  return true;
}

export function sanitizeLocality(name) {
  return isValidLocalityName(name) ? String(name).trim() : '';
}

export function extractCityFromUrl(url) {
  const slugMatch = String(url || '').match(/\/view\/d\/([^/?#]+)/i);
  if (!slugMatch) return '';

  const parts = slugMatch[1].split('-').filter(Boolean);
  const cityParts = [];

  for (const part of parts) {
    if (URL_CITY_STOP_WORDS.has(part)) break;
    if (/^\d+$/.test(part)) break;
    cityParts.push(part);
    if (cityParts.length >= 3) break;
  }

  if (!cityParts.length) return '';

  const city = cityParts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

  return sanitizeLocality(city);
}

export function pickLocality(...candidates) {
  for (const candidate of candidates) {
    const value = sanitizeLocality(candidate);
    if (value) return value;
  }
  return '';
}
