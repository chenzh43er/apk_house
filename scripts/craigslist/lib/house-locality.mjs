export function hasRequiredLocality(houseGer) {
  const district = String(houseGer?.district ?? houseGer?.display_district ?? '').trim();
  const city = String(houseGer?.city ?? houseGer?.display_city ?? '').trim();
  return district.length > 0 && city.length > 0;
}

export function localitySummary(houseGer) {
  return {
    district: String(houseGer?.district ?? houseGer?.display_district ?? '').trim(),
    city: String(houseGer?.city ?? houseGer?.display_city ?? '').trim()
  };
}
