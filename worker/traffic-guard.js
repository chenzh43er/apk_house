/**
 * 边缘流量防护模块（可被 worker.js 引用，或与 worker.js 内联逻辑保持同步）
 *
 * 目标：减少 bot / scraper 对带 AdSense 的 HTML 页面访问，同时放行：
 *  - 搜索引擎与广告爬虫（Googlebot、AdsBot 等）
 *  - 静态资源、API 请求、ads.txt / robots.txt
 */

const RATE_LIMIT = {
  ipWindowMs: 60_000,
  ipBurstLimit: 20,
  uaWindowMs: 60_000,
  uaBurstLimit: 80,
  adWindowMs: 120_000,
  adBurstLimit: 8,
  geoWindowMs: 180_000,
  geoDistinctLimit: 12,
};

const rateState = {
  ip: new Map(),
  ua: new Map(),
  ad: new Map(),
  geo: new Map(),
};

/** 可信爬虫 User-Agent 白名单（含 Google 广告/搜索/验证爬虫） */
const GOOD_BOT_UA =
  /googlebot|adsbot-google|mediapartners-google|google-inspectiontool|storebot-google|googleother|feedfetcher-google|google-safety|google-adwords|google-ads|adsquality|bingbot|applebot|duckduckbot|yandexbot|facebookexternalhit|twitterbot|linkedinbot|slackbot|discordbot|whatsapp|telegrambot/i;

/** 已知恶意 / 自动化工具 User-Agent 黑名单 */
const BAD_BOT_UA =
  /headless|phantomjs|puppeteer|selenium|playwright|webdriver|python-requests|python-urllib|scrapy|httpclient|java\/|libwww|wget|curl\/|httpx|go-http-client|axios\/|node-fetch|postman|insomnia|semrush|ahrefsbot|mj12bot|dotbot|petalbot|bytespider|gptbot|claudebot|ccbot|aiohttp|okhttp|perl|ruby|mechanize|beautifulsoup|masscan|zgrab|nikto|sqlmap/i;

const LANG_SEGMENT = "(?:de|us|de-ch-at)";
const AD_PAGE_NAMES = "(?:form|result|list|detail|state|city|district|teach|post|home)";

function isStaticOrApiPath(pathname) {
  return (
    pathname.startsWith("/cdn/") ||
    pathname.startsWith("/Public/") ||
    pathname.startsWith("/Assets/") ||
    /\.(css|js|png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|eot|map|txt|xml)$/i.test(pathname) ||
    new RegExp(`^\\/${LANG_SEGMENT}\\/(?:rest|rpc|storage|auth)`, "i").test(pathname)
  );
}

function isHtmlPage(pathname) {
  if (pathname === "/" || pathname === "/index.html" || pathname === "/language.html") {
    return true;
  }
  if (isStaticOrApiPath(pathname)) return false;
  if (/\.html$/i.test(pathname)) return true;
  return !/\.[a-z0-9]+$/i.test(pathname);
}

/** 判断是否为含 AdSense 的页面 */
export function isAdPage(pathname) {
  if (pathname === "/" || pathname === "/index.html" || pathname === "/post") {
    return true;
  }
  if (new RegExp(`^\\/${LANG_SEGMENT}\\/${AD_PAGE_NAMES}(?:\\.html)?$`, "i").test(pathname)) {
    return true;
  }
  if (new RegExp(`^\\/${AD_PAGE_NAMES}(?:\\.html)?$`, "i").test(pathname)) {
    return true;
  }
  if (
    new RegExp(
      `^\\/${LANG_SEGMENT}\\/teach\\/state\\/[^/]+\\/[^/]+\\/[^/]+\\/[^/]+\\/(?:form|result|detail|list)$`,
      "i"
    ).test(pathname)
  ) {
    return true;
  }
  if (
    new RegExp(
      `^\\/${LANG_SEGMENT}\\/teach\\/state\\/[^/]+\\/[^/]+\\/[^/]+\\/\\d+\\/list$`,
      "i"
    ).test(pathname)
  ) {
    return true;
  }
  if (new RegExp(`^\\/${LANG_SEGMENT}\\/post\\/\\d+\\/\\d+$`, "i").test(pathname)) {
    return true;
  }
  return false;
}

function getUserAgent(request) {
  return request.headers.get("User-Agent") || "";
}

function getClientIp(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function getClientUa(request) {
  return getUserAgent(request).slice(0, 180).trim() || "unknown";
}

function isGoodBot(request) {
  const ua = getUserAgent(request);
  if (GOOD_BOT_UA.test(ua)) return true;
  if (request.cf?.botManagement?.verifiedBot) return true;
  return false;
}

function isBadBot(request) {
  const ua = getUserAgent(request);
  if (!ua.trim()) return true;
  if (BAD_BOT_UA.test(ua)) return true;
  const score = request.cf?.botManagement?.score;
  if (typeof score === "number" && score <= 10) return true;
  return false;
}

function hasSuspiciousSignals(request, pathname) {
  if (!isAdPage(pathname)) return false;

  if (request.method === "HEAD") return false;

  const accept = request.headers.get("Accept") || "";
  const ua = getUserAgent(request);
  const acceptsHtml =
    accept.includes("text/html") ||
    accept.includes("application/xhtml+xml") ||
    accept.includes("*/*");

  if (!acceptsHtml) {
    return true;
  }
  if (/bot|crawl|spider/i.test(ua) && !isGoodBot(request)) {
    return true;
  }

  return false;
}

function keyStat(map, key, windowMs) {
  const now = Date.now();
  let entry = map.get(key);
  if (!entry || now - entry.start >= windowMs) {
    entry = { start: now, count: 0 };
    map.set(key, entry);
  }
  entry.count += 1;
  return entry;
}

function trackDistinctGeo(ip, geo, windowMs) {
  const key = `geo:${ip}`;
  const now = Date.now();
  let entry = rateState.geo.get(key);
  if (!entry || now - entry.start >= windowMs) {
    entry = { start: now, seen: new Set() };
    rateState.geo.set(key, entry);
  }
  entry.seen.add(geo);
  return entry.seen.size;
}

function cleanupRateMap(map, windowMs) {
  const now = Date.now();
  for (const [key, entry] of map.entries()) {
    if (now - entry.start >= windowMs * 2) map.delete(key);
  }
}

function cleanupGeoRateMap(windowMs) {
  const now = Date.now();
  for (const [key, entry] of rateState.geo.entries()) {
    if (now - entry.start >= windowMs * 2) rateState.geo.delete(key);
  }
}

function geoFingerprint(pathname) {
  const m = pathname.match(
    new RegExp(`^\\/(${LANG_SEGMENT})\\/teach\\/state\\/([^/]+)\\/([^/]+)\\/([^/]+)\\/`, "i")
  );
  if (!m) return null;
  return [m[1].toLowerCase(), m[2].toLowerCase(), m[3].toLowerCase()].join("|");
}

function evaluateRateLimit(request, pathname) {
  const ip = getClientIp(request);
  const ua = getClientUa(request);
  let risk = 0;
  const reasons = [];

  const ipStat = keyStat(rateState.ip, `ip:${ip}`, RATE_LIMIT.ipWindowMs);
  const uaStat = keyStat(rateState.ua, `ua:${ua}`, RATE_LIMIT.uaWindowMs);

  if (ipStat.count > RATE_LIMIT.ipBurstLimit) {
    risk += 3;
    reasons.push("ip_burst");
  }
  if (uaStat.count > RATE_LIMIT.uaBurstLimit) {
    risk += 2;
    reasons.push("ua_burst");
  }

  const geo = geoFingerprint(pathname);
  if (geo) {
    const distinctGeos = trackDistinctGeo(ip, geo, RATE_LIMIT.geoWindowMs);
    if (distinctGeos > RATE_LIMIT.geoDistinctLimit) {
      risk += 3;
      reasons.push("geo_scan");
    }
  }

  if (isAdPage(pathname)) {
    const adStat = keyStat(rateState.ad, `ad:${ip}`, RATE_LIMIT.adWindowMs);
    if (adStat.count > RATE_LIMIT.adBurstLimit) {
      risk += 2;
      reasons.push("ad_page_burst");
    }
  }

  cleanupRateMap(rateState.ip, RATE_LIMIT.ipWindowMs);
  cleanupRateMap(rateState.ua, RATE_LIMIT.uaWindowMs);
  cleanupRateMap(rateState.ad, RATE_LIMIT.adWindowMs);
  cleanupGeoRateMap(RATE_LIMIT.geoWindowMs);

  return { risk, reasons };
}

function blockResponse(reason, request) {
  const pathname = new URL(request.url).pathname;
  console.log(
    JSON.stringify({
      event: "traffic_guard_block",
      reason,
      path: pathname,
      ua: getUserAgent(request).slice(0, 160),
      ip: getClientIp(request),
      country: request.cf?.country,
      botScore: request.cf?.botManagement?.score ?? null,
    })
  );

  return new Response("Forbidden", {
    status: 403,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Traffic-Guard": reason,
    },
  });
}

/**
 * 流量清洗主入口。
 * @returns {Response | null} 403 拦截响应，或 null 表示放行
 */
export function evaluateTrafficGuard(request) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return null;
  }

  const pathname = new URL(request.url).pathname;

  if (pathname === "/ads.txt" || pathname === "/robots.txt") {
    return null;
  }

  if (isStaticOrApiPath(pathname)) {
    return null;
  }

  if (!isHtmlPage(pathname)) {
    return null;
  }

  if (isGoodBot(request)) {
    return null;
  }

  if (isBadBot(request)) {
    return blockResponse("bot", request);
  }

  if (hasSuspiciousSignals(request, pathname)) {
    return blockResponse("suspicious", request);
  }

  const { risk, reasons } = evaluateRateLimit(request, pathname);
  if (risk >= 3) {
    return blockResponse(reasons.join(","), request);
  }

  return null;
}

/** 为 HTML 响应附加安全响应头 */
export function applySecurityHeaders(response, pathname) {
  const headers = new Headers(response.headers);
  const isHtml =
    /\.html?$/i.test(pathname || "") ||
    headers.get("Content-Type")?.includes("text/html");

  if (!isStaticOrApiPath(pathname)) {
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "SAMEORIGIN");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  }

  if (isHtml && !headers.get("Cache-Control")) {
    headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
