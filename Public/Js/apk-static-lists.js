/**
 * 选择器列表静态 JSON：优先 CDN 短缓存，失败再回落 Supabase RPC。
 */
export async function tryStaticList(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) && data.length ? data : null;
  } catch (e) {
    return null;
  }
}

export function staticStatesUrl(region) {
  return "/Public/Data/" + region + "/states.json";
}

export function staticCitiesUrl(region, state) {
  if (!state) return null;
  return (
    "/Public/Data/" +
    region +
    "/cities/" +
    encodeURIComponent(state) +
    ".json"
  );
}

export function staticDistrictsUrl(region, state, city) {
  if (!state || !city) return null;
  return (
    "/Public/Data/" +
    region +
    "/districts/" +
    encodeURIComponent(state) +
    "/" +
    encodeURIComponent(city) +
    ".json"
  );
}

/** 与页面 lang / country 对齐的静态数据分区 */
export function pickerDataRegion(lang, country) {
  if (lang === "us") return "us";
  if (lang === "de") return "de";
  if (lang === "de-ch-at") {
    if (country === "ch") return "ch";
    if (country === "at") return "at";
    return "de";
  }
  if (country === "ch") return "ch";
  if (country === "at") return "at";
  if (country === "de") return "de";
  return "de";
}
