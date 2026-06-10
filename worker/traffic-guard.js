const DEFAULTS = {
  // 短时间同 IP 高并发访问
  ipWindowMs: 60_000,
  ipBurstLimit: 20,
  // 同 UA 高频访问
  uaWindowMs: 60_000,
  uaBurstLimit: 80,
  // 同 IP 访问广告页过快
  adWindowMs: 120_000,
  adBurstLimit: 8,
  // 同 IP / UA 扫描多个州/城市/地区 URL
  geoWindowMs: 180_000,
  geoBurstLimit: 12,
};

const state = {
  ip: new Map(),
  ua: new Map(),
  ad: new Map(),
  geo: new Map(),
};

/** 已知恶意 / 自动化工具 User-Agent 黑名单 */
const BAD_BOT_UA =
  /headless|phantomjs|puppeteer|selenium|playwright|webdriver|python-requests|python-urllib|aiohttp|okhttp|perl|ruby|mechanize|beautifulsoup|masscan|zgrab|nikto|sqlmap|scrapy|httpclient|java\/|libwww|wget|curl\/|httpx|go-http-client|axios\/|node-fetch|postman|insomnia|semrush|ahrefsbot|mj12bot|dotbot|petalbot|bytespider|gptbot|claudebot|ccbot/i;

function getClientIp(request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function getClientUa(request) {
  return (request.headers.get("user-agent") || "").slice(0, 180).trim() || "unknown";
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

function cleanupMap(map, windowMs) {
  const now = Date.now();
  for (const [key, entry] of map.entries()) {
    if (now - entry.start >= windowMs * 2) map.delete(key);
  }
}

function isHtmlNavigation(request) {
  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html") || accept.includes("application/xhtml+xml");
}

function isAdPage(pathname) {
  return /\/(ad|ads|advert|advertisement|banner|sponsor)(\/|$)/i.test(pathname);
}

function geoFingerprint(pathname) {
  const m = pathname.match(/^\/(de|us|de-ch-at)\/teach\/state\/([^/]+)\/([^/]+)\/([^/]+)\//i);
  if (!m) return null;
  return [m[1].toLowerCase(), m[2].toLowerCase(), m[3].toLowerCase()].join("|");
}

export function evaluateTrafficGuard(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // 静态资源、API 和爬虫文件不做频控，避免误伤
  if (
    /\.(css|js|png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|eot|map|txt|xml)$/i.test(pathname) ||
    pathname.startsWith("/cdn/") ||
    /^\/(de|us|de-ch-at)\/(rest|rpc|storage|auth)\//i.test(pathname)
  ) {
    return null;
  }

  // 只对 HTML 导航做重点管控
  if (!isHtmlNavigation(request)) return null;

  const ip = getClientIp(request);
  const ua = getClientUa(request);
  const ipKey = `ip:${ip}`;
  const uaKey = `ua:${ua}`;

  const ipStat = keyStat(state.ip, ipKey, DEFAULTS.ipWindowMs);
  const uaStat = keyStat(state.ua, uaKey, DEFAULTS.uaWindowMs);

  let risk = 0;
  const reasons = [];

  if (ipStat.count > DEFAULTS.ipBurstLimit) {
    risk += 3;
    reasons.push("ip_burst");
  }
  if (uaStat.count > DEFAULTS.uaBurstLimit) {
    risk += 2;
    reasons.push("ua_burst");
  }

  const geo = geoFingerprint(pathname);
  if (geo) {
    const geoStat = keyStat(state.geo, `geo:${ip}:${geo}`, DEFAULTS.geoWindowMs);
    if (geoStat.count > DEFAULTS.geoBurstLimit) {
      risk += 3;
      reasons.push("geo_scan");
    }
  }

  if (isAdPage(pathname)) {
    const adStat = keyStat(state.ad, `ad:${ip}`, DEFAULTS.adWindowMs);
    if (adStat.count > DEFAULTS.adBurstLimit) {
      risk += 2;
      reasons.push("ad_page_burst");
    }
  }

  cleanupMap(state.ip, DEFAULTS.ipWindowMs);
  cleanupMap(state.ua, DEFAULTS.uaWindowMs);
  cleanupMap(state.geo, DEFAULTS.geoWindowMs);
  cleanupMap(state.ad, DEFAULTS.adWindowMs);

  if (risk >= 5) {
    return new Response("Forbidden", {
      status: 403,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
        "X-Traffic-Guard": reasons.join(","),
      },
    });
  }

  if (risk >= 3) {
    // 中风险不直接 403：返回低价值页面，减少广告曝光和资源消耗
    return new Response(
      "<html><head><meta name=\"robots\" content=\"noindex,nofollow\"></head><body><h1>Access limited</h1></body></html>",
      {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Traffic-Guard": reasons.join(","),
        },
      }
    );
  }

  return null;
}

export function applySecurityHeaders(response, pathname) {
  const res = new Response(response.body, response);
  const isHtml = /\.(html?)$/i.test(pathname || "") || res.headers.get("Content-Type")?.includes("text/html");

  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-Frame-Options", "SAMEORIGIN");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  if (isHtml) {
    res.headers.set("Cache-Control", res.headers.get("Cache-Control") || "private, no-cache, no-store, must-revalidate");
  }

  return res;
}
