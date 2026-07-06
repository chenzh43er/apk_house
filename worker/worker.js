/**
 * houseworker — identityinsight.org 统一边缘 Worker
 *
 * 功能模块（按请求处理顺序）：
 *  1. SEO/AdSense 爬虫文件（ads.txt、robots.txt）
 *  2. 流量清洗（bot / scraper 拦截 + IP/UA/广告页频控，见「流量防护模块」）
 *  3. 首页重定向（/index.html、/language.html → /）
 *  4. R2 CDN 图片代理（/cdn/{region}/...）
 *  5. Supabase API 反向代理（/{lang}/rest|rpc|storage|auth）
 *  6. 静态资源透传（CSS/JS/图片/Public/Assets）
 *  7. SEO 友好 URL 重写（teach/state 路径 → 实际 HTML 页面）
 *  8. 文章路径重写（/{lang}/post/{id}/{page} → /{lang}/post）
 *  9. 默认透传（其余 HTML 页面回源 Pages，附加安全响应头）
 */

// ═══════════════════════════════════════════════════════════════════════════
// 流量防护模块
// 目标：减少 bot / scraper 对带 AdSense 的 HTML 页面访问，同时放行：
//  - 搜索引擎与广告爬虫（Googlebot、AdsBot 等）
//  - 静态资源、API 请求、ads.txt / robots.txt
// ═══════════════════════════════════════════════════════════════════════════

const RATE_LIMIT = {
  ipWindowMs: 60_000,
  ipBurstLimit: 60,
  uaWindowMs: 60_000,
  uaBurstLimit: 120,
  adWindowMs: 120_000,
  adBurstLimit: 24,
  geoWindowMs: 180_000,
  geoDistinctLimit: 24,
};

const rateState = {
  ip: new Map(),
  ua: new Map(),
  ad: new Map(),
  geo: new Map(),
};

/** 可信爬虫 User-Agent 白名单（含 Google 广告/搜索/验证爬虫） */
const GOOD_BOT_UA =
  /googlebot|adsbot-google|mediapartners-google|google-inspectiontool|storebot-google|googleother|feedfetcher-google|google-safety|bingbot|applebot|duckduckbot|yandexbot|facebookexternalhit|twitterbot|linkedinbot|slackbot|discordbot|whatsapp|telegrambot/i;

/** 已知恶意 / 自动化工具 User-Agent 黑名单 */
const BAD_BOT_UA =
  /headless|phantomjs|puppeteer|selenium|playwright|webdriver|python-requests|python-urllib|scrapy|httpclient|java\/|libwww|wget|curl\/|httpx|go-http-client|axios\/|node-fetch|postman|insomnia|semrush|ahrefsbot|mj12bot|dotbot|petalbot|bytespider|gptbot|claudebot|ccbot|aiohttp|okhttp|perl|ruby|mechanize|beautifulsoup|masscan|zgrab|nikto|sqlmap/i;

const LANG_SEGMENT = "(?:de|us|de-ch-at)";
const AD_PAGE_NAMES = "(?:form|result|list|detail|state|city|district|teach|post|home)";

/** 静态资源、CDN、Supabase API 等不需要流量清洗的路径 */
function isStaticOrApiPath(pathname) {
  return (
    pathname.startsWith("/cdn/") ||
    pathname.startsWith("/Public/") ||
    pathname.startsWith("/Assets/") ||
    /\.(css|js|png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|eot|map|txt|xml)$/i.test(pathname) ||
    new RegExp(`^\\/${LANG_SEGMENT}\\/(?:rest|rpc|storage|auth)`, "i").test(pathname)
  );
}

/** 判断路径是否为 HTML 页面（含 SEO 无扩展名路径） */
function isHtmlPage(pathname) {
  if (pathname === "/" || pathname === "/index.html" || pathname === "/language.html") {
    return true;
  }
  if (isStaticOrApiPath(pathname)) return false;
  if (/\.html$/i.test(pathname)) return true;
  return !/\.[a-z0-9]+$/i.test(pathname);
}

/** 判断是否为含 AdSense 的页面（用于可疑信号检测与广告页频控） */
function isAdPage(pathname) {
  // 首页仅为地区选择，无广告 — 不应走广告页频控
  if (pathname === "/" || pathname === "/index.html" || pathname === "/language.html") {
    return false;
  }
  if (pathname === "/post") {
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
  if (
    new RegExp(
      `^\\/teach\\/state\\/[^/]+\\/[^/]+\\/[^/]+\\/[^/]+\\/(?:form|result|detail|list)$`,
      "i"
    ).test(pathname)
  ) {
    return true;
  }
  if (
    new RegExp(
      `^\\/teach\\/state\\/[^/]+\\/[^/]+\\/[^/]+\\/\\d+\\/list$`,
      "i"
    ).test(pathname)
  ) {
    return true;
  }
  if (pathname === "/teach/state" || /^\/teach\/state\//i.test(pathname)) {
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

/** 白名单 UA 或 Cloudflare verifiedBot */
function isGoodBot(request) {
  const ua = getUserAgent(request);
  if (GOOD_BOT_UA.test(ua)) return true;

  const cf = request.cf;
  if (cf?.botManagement?.verifiedBot) return true;

  return false;
}

/** 空 UA、黑名单 UA 或 Cloudflare bot score ≤ 10 */
function isBadBot(request) {
  const ua = getUserAgent(request);
  if (!ua.trim()) return true;
  if (BAD_BOT_UA.test(ua)) return true;

  const cf = request.cf;
  const score = cf?.botManagement?.score;
  // 仅拦截 Cloudflare 判定为「确定自动化」的流量（1 分），避免误杀正常用户
  if (typeof score === "number" && score <= 1) return true;

  return false;
}

/** 含广告页面的额外可疑信号：缺少 Accept: text/html 或 UA 含 bot/crawl/spider */
function hasSuspiciousSignals(request, pathname) {
  if (!isAdPage(pathname)) return false;

  const accept = request.headers.get("Accept") || "";
  const ua = getUserAgent(request);

  if (!accept.includes("text/html") && !accept.includes("application/xhtml+xml")) {
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

/** IP / UA / 广告页 / 跨地区扫描频控，返回 risk 分数与原因列表 */
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

/** 从 teach/state SEO 路径提取 lang|state|city 指纹，用于跨地区扫描检测 */
function geoFingerprint(pathname) {
  const m = pathname.match(
    new RegExp(`^\\/(${LANG_SEGMENT})\\/teach\\/state\\/([^/]+)\\/([^/]+)\\/([^/]+)\\/`, "i")
  );
  if (m) {
    return [m[1].toLowerCase(), m[2].toLowerCase(), m[3].toLowerCase()].join("|");
  }
  const bare = pathname.match(/^\/teach\/state\/([^/]+)\/([^/]+)\/([^/]+)\//i);
  if (bare) {
    return ["us", bare[1].toLowerCase(), bare[2].toLowerCase()].join("|");
  }
  return null;
}

/**
 * 流量清洗主入口。
 * @returns {Response | null} 403 拦截响应，或 null 表示放行
 */
function isLocalDev(request) {
  const host = new URL(request.url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

/** 已通过 Cloudflare 人机验证，或具备真实浏览器导航特征 */
function isTrustedBrowserSession(request) {
  const cookie = request.headers.get("Cookie") || "";
  if (/\bcf_clearance=/.test(cookie)) return true;

  const secFetchMode = request.headers.get("Sec-Fetch-Mode");
  const secFetchDest = request.headers.get("Sec-Fetch-Dest");
  if (secFetchMode === "navigate" && secFetchDest === "document") return true;

  if (request.headers.get("Sec-CH-UA")) return true;

  return false;
}

function evaluateTrafficGuard(request) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return null;
  }

  if (isLocalDev(request)) {
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

  if (isTrustedBrowserSession(request)) {
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

/** 返回 403 并记录结构化拦截日志 */
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
 * 为 HTML 响应附加安全响应头（静态资源不加，避免影响缓存/CDN）。
 */
function applySecurityHeaders(response, pathname) {
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

// ═══════════════════════════════════════════════════════════════════════════
// 路由与业务逻辑
// ═══════════════════════════════════════════════════════════════════════════

/** 支持的语言前缀，用于路由匹配与 Supabase 分流 */
const LANGS = ["de", "us", "de-ch-at"];
const LANG = LANGS.join("|");

/** R2 区域 → Wrangler binding 名称映射 */
const CDN_BUCKETS = {
  us: "HOUSEUS",
  de: "HOUSEPIC",
  at: "HOUSEAT",
  ch: "HOUSECH",
};

/** /teach/state 无语言前缀时，从 query 推断默认语言（否则 us） */
function resolveLangFromRequest(request) {
  const url = new URL(request.url);
  const lang = (url.searchParams.get("lang") || "").toLowerCase();
  if (LANGS.includes(lang)) return lang;

  const country = (url.searchParams.get("country") || "").toLowerCase();
  if (country === "de") return "de";
  if (country === "at" || country === "ch") return "de-ch-at";

  return "us";
}

/** 将 /teach/state/... 补全为 /{lang}/teach/state/... */
function withLangTeachPath(pathname, request) {
  if (!/^\/teach\/state(?:\/|$)/i.test(pathname)) return pathname;
  if (new RegExp(`^\\/(${LANG})(?:\\/|$)`, "i").test(pathname)) return pathname;
  return `/${resolveLangFromRequest(request)}${pathname}`;
}

/** ads.txt：同时声明 ADX(GAM) 与 AdSense 授权（无需随 mode 切换） */
const ADS_TXT_BODY =
  "google.com, pub-7335996243328726, DIRECT, f08c47fec0942fa0\n" +
  "google.com, pub-3481735481590354, DIRECT, f08c47fec0942fa0\n";

/** robots.txt：允许搜索引擎与 Google 广告爬虫抓取全站 */
const ROBOTS_TXT_BODY = `User-agent: *
Allow: /

User-agent: AdsBot-Google
Allow: /

User-agent: Mediapartners-Google
Allow: /

User-agent: Googlebot
Allow: /

Sitemap: https://identityinsight.org/sitemap.xml
`;

/** Pages 生产回源地址（Zone Worker 无 ASSETS binding 时使用） */
const PAGES_ORIGIN = "https://apk-house.pages.dev";

/**
 * 静态资源 / HTML 回源 Pages，并为 HTML 响应附加安全头。
 * 本地 dev 使用 ASSETS binding；线上 Zone Worker 回源 apk-house.pages.dev。
 */
async function passThrough(request, env, pathname) {
  let res;
  if (env.ASSETS) {
    res = await env.ASSETS.fetch(request);
  } else {
    const reqUrl = new URL(request.url);
    const path = pathname || reqUrl.pathname;
    const pagesUrl = new URL(path + reqUrl.search, PAGES_ORIGIN);
    res = await fetch(
      new Request(pagesUrl, {
        method: request.method,
        headers: request.headers,
        body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
        redirect: "follow",
      })
    );
  }
  return applySecurityHeaders(res, pathname || new URL(request.url).pathname);
}

/**
 * SEO 友好 URL → 实际页面路径的内部重写。
 * 保留原始 query string，将路径参数展开为 searchParams。
 */
function rewrite(request, targetPath, params, env) {
  const url = new URL(request.url);
  const targetUrl = new URL(`${url.origin}${targetPath}`);

  url.searchParams.forEach((value, key) => {
    targetUrl.searchParams.set(key, value);
  });

  for (const [key, value] of Object.entries(params)) {
    targetUrl.searchParams.set(key, decodeURIComponent(value));
  }

  return passThrough(new Request(targetUrl, request), env, targetPath);
}

/**
 * 按语言选择 Supabase 后端 origin。
 * de-ch-at 在三个实例间随机负载均衡。
 */
function getSupabaseOrigin(lang) {
  if (lang === "us") {
    return "https://uoxzcftzwemdrmcmhuhb.supabase.co";
  }

  if (lang === "de-ch-at") {
    const list = [
      "https://aabogtftiapiwehgmezt.supabase.co",
      "https://yioqqdprzzeqrlwfyqov.supabase.co",
      "https://zxvflhunzznslxzqreih.supabase.co",
    ];
    return list[Math.floor(Math.random() * list.length)];
  }

  if (lang === "de") {
    return "https://aabogtftiapiwehgmezt.supabase.co";
  }
}

/**
 * 直接返回 ads.txt / robots.txt，确保 AdSense 与 SEO 爬虫不被拦截或回源失败。
 * @returns {Response | null}
 */
function serveCrawlerFile(pathname) {
  if (pathname === "/ads.txt") {
    return new Response(ADS_TXT_BODY, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }
  if (pathname === "/robots.txt") {
    return new Response(ROBOTS_TXT_BODY, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }
  return null;
}

/**
 * R2 图片 CDN 代理：/cdn/{us|de|at|ch}/{key}
 * 命中 Cloudflare Cache API 缓存，未命中则从对应 R2 bucket 读取。
 */
async function r2ImageProxy(request, env, ctx) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/cdn\/(us|de|at|ch)\/(.+)$/);
  if (!match) return null;

  const [, region, key] = match;
  const bucket = env[CDN_BUCKETS[region]];
  if (!bucket) return new Response("R2 binding missing", { status: 503 });

  try {
    const cache = caches.default;
    let res = await cache.match(request);
    if (res) return res;

    const object = await bucket.get(key);
    if (!object) return new Response("Not Found", { status: 404 });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.set("Access-Control-Allow-Origin", "*");

    res = new Response(object.body, { headers });
    ctx.waitUntil(cache.put(request, res.clone()));
    return res;
  } catch (err) {
    return new Response(`R2 error: ${err?.message || err}`, { status: 502 });
  }
}

/**
 * Supabase REST/RPC/Storage/Auth 反向代理：/{lang}/rest|rpc|storage|auth/...
 * GET 请求缓存 60 秒；写操作直接透传。
 */
async function supabaseProxy(request, lang, ctx) {
  const origin = getSupabaseOrigin(lang);
  const url = new URL(request.url);

  const path = url.pathname.replace(new RegExp(`^/${lang}`), "");
  const target = origin + path + url.search;

  const newReq = new Request(target, request);
  newReq.headers.delete("host");

  if (request.method === "GET") {
    const cache = caches.default;
    let res = await cache.match(request);
    if (res) return res;

    res = await fetch(newReq);
    res = new Response(res.body, res);
    res.headers.set("Cache-Control", "public, max-age=60");

    ctx.waitUntil(cache.put(request, res.clone()));
    return res;
  }

  return fetch(newReq);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // ── 1. SEO / AdSense 爬虫文件（优先返回，不经过流量清洗） ──
    const crawlerFile = serveCrawlerFile(pathname);
    if (crawlerFile) return crawlerFile;

    // ── 2. 流量清洗：拦截 bot / scraper 对 HTML 页面的访问 ──
    const blocked = evaluateTrafficGuard(request);
    if (blocked) return blocked;

    // ── 3. 首页规范化重定向 ──
    if (pathname === "/language.html" || pathname === "/index.html") {
      const target = new URL("/", request.url);
      target.search = url.search;
      return Response.redirect(target.toString(), 301);
    }

    // /us、/de、/de-ch-at 无尾斜杠时，相对链接 ./teach/state 会解析成 /teach/state（丢失语言前缀）
    if (/^\/(de|us|de-ch-at)$/.test(pathname)) {
      const target = new URL(`${pathname}/`, request.url);
      target.search = url.search;
      return Response.redirect(target.toString(), 301);
    }

    // ── 4. R2 CDN 图片代理 ──
    if (pathname.startsWith("/cdn/")) {
      const imageRes = await r2ImageProxy(request, env, ctx);
      if (imageRes) return imageRes;
    }

    // ── 5. Supabase API 反向代理 ──
    const apiMatch = pathname.match(
      new RegExp(`^\\/(${LANG})\\/(rest|rpc|storage|auth)`, "i")
    );
    if (apiMatch) {
      const lang = apiMatch[1];
      return supabaseProxy(request, lang, ctx);
    }

    // ── 6. 静态资源透传 ──
    if (
      /\.(css|js|png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|eot|map)$/i.test(pathname) ||
      pathname.startsWith("/Public/") ||
      pathname.startsWith("/Assets/")
    ) {
      return passThrough(request, env, pathname);
    }

    // ── 7. SEO 友好 URL 重写（teach/state 层级路径） ──
    const routePath = withLangTeachPath(pathname, request);

    // /{lang}/teach/state/{state}/{city}/{district}/{id}/result → /{lang}/result?id=...
    let m = routePath.match(
      new RegExp(
        `^\\/(${LANG})\\/teach\\/state\\/([^/]+)\\/([^/]+)\\/([^/]+)\\/([^/]+)\\/result$`,
        "i"
      )
    );
    if (m) {
      const [, lang, state, city, district, id] = m;
      return rewrite(request, `/${lang}/result`, { id, state, city, district }, env);
    }

    // /{lang}/teach/state/{state}/{city}/{district}/{id}/form → /{lang}/form?id=...
    m = routePath.match(
      new RegExp(
        `^\\/(${LANG})\\/teach\\/state\\/([^/]+)\\/([^/]+)\\/([^/]+)\\/([^/]+)\\/form$`,
        "i"
      )
    );
    if (m) {
      const [, lang, state, city, district, id] = m;
      return rewrite(request, `/${lang}/form`, { id, state, city, district }, env);
    }

    // /{lang}/teach/state/{state}/{city}/{district}/{id}/detail → /{lang}/detail?id=...
    m = routePath.match(
      new RegExp(
        `^\\/(${LANG})\\/teach\\/state\\/([^/]+)\\/([^/]+)\\/([^/]+)\\/([^/]+)\\/detail$`,
        "i"
      )
    );
    if (m) {
      const [, lang, state, city, district, id] = m;
      return rewrite(request, `/${lang}/detail`, { id, state, city, district }, env);
    }

    // /{lang}/teach/state/{state}/{city}/{district}/{page}/list → /{lang}/list?...
    m = routePath.match(
      new RegExp(
        `^\\/(${LANG})\\/teach\\/state\\/([^/]+)\\/([^/]+)\\/([^/]+)\\/(\\d+)\\/list$`,
        "i"
      )
    );
    if (m) {
      const [, lang, state, city, district, page] = m;
      return rewrite(request, `/${lang}/list`, { state, city, district, page }, env);
    }

    // /{lang}/teach/state/{state}/{city}/district → /{lang}/district?state=...&city=...
    m = routePath.match(
      new RegExp(
        `^\\/(${LANG})\\/teach\\/state\\/([^/]+)\\/([^/]+)\\/district$`,
        "i"
      )
    );
    if (m) {
      const [, lang, state, city] = m;
      return rewrite(request, `/${lang}/district`, { state, city }, env);
    }

    // /{lang}/teach/state/{state}/city → /{lang}/city?state=...
    m = routePath.match(
      new RegExp(`^\\/(${LANG})\\/teach\\/state\\/([^/]+)\\/city$`, "i")
    );
    if (m) {
      const [, lang, state] = m;
      return rewrite(request, `/${lang}/city`, { state }, env);
    }

    // /{lang}/teach/state → /{lang}/state
    m = routePath.match(new RegExp(`^\\/(${LANG})\\/teach\\/state$`, "i"));
    if (m) {
      const [, lang] = m;
      return rewrite(request, `/${lang}/state`, {}, env);
    }

    // ── 8. 文章路径重写：/{lang}/post/{postid}/{page} → /{lang}/post?postid=...&page=... ──
    m = pathname.match(
      new RegExp(`^\\/(${LANG})\\/post\\/(\\d+)\\/(\\d+)$`, "i")
    );
    if (m) {
      const [, lang, postid, page] = m;
      return rewrite(request, `/${lang}/post`, { postid, page }, env);
    }

    // ── 9. 默认透传：其余 HTML 页面回源 Pages ──
    return passThrough(request, env, pathname);
  },
};
