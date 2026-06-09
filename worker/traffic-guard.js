/**
 * 边缘流量防护模块
 *
 * 目标：减少 bot / scraper 对带 AdSense 的 HTML 页面访问，同时放行：
 *  - 搜索引擎与广告爬虫（Googlebot、AdsBot 等）
 *  - 静态资源、API 请求、ads.txt / robots.txt
 */

/** 可信爬虫 User-Agent 白名单 */
const GOOD_BOT_UA =
  /googlebot|adsbot-google|mediapartners-google|bingbot|applebot|duckduckbot|yandexbot|facebookexternalhit|twitterbot|linkedinbot|slackbot|discordbot|whatsapp|telegrambot/i;

/** 已知恶意 / 自动化工具 User-Agent 黑名单 */
const BAD_BOT_UA =
  /headless|phantomjs|puppeteer|selenium|playwright|webdriver|python-requests|python-urllib|scrapy|httpclient|java\/|libwww|wget|curl\/|httpx|go-http-client|axios\/|node-fetch|postman|insomnia|semrush|ahrefsbot|mj12bot|dotbot|petalbot|bytespider|gptbot|claudebot|ccbot/i;

/** 含 AdSense 的敏感页面路径（form / result 页） */
const AD_SENSITIVE_RE =
  /\/(?:form|result)(?:\.html)?$|\/teach\/state\/[^/]+\/[^/]+\/[^/]+\/[^/]+\/(?:form|result)$/i;

/** 静态资源、CDN、Supabase API 等不需要流量清洗的路径 */
function isStaticOrApiPath(pathname) {
  return (
    pathname.startsWith("/cdn/") ||
    pathname.startsWith("/Public/") ||
    pathname.startsWith("/Assets/") ||
    /\.(css|js|png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|eot|map|txt|xml)$/i.test(pathname) ||
    /^\/(?:de|us|de-ch-at)\/(?:rest|rpc|storage|auth)/i.test(pathname)
  );
}

/** 判断路径是否为 HTML 页面（含 SEO 无扩展名路径） */
function isHtmlPage(pathname) {
  if (pathname === "/" || pathname === "/index.html" || pathname === "/language.html") {
    return true;
  }
  if (isStaticOrApiPath(pathname)) return false;
  if (/\.html$/i.test(pathname)) return true;
  // SEO 友好路径（无扩展名）视为 HTML
  return !/\.[a-z0-9]+$/i.test(pathname);
}

/** 判断是否为含广告的敏感页面 */
function isAdSensitivePage(pathname) {
  return AD_SENSITIVE_RE.test(pathname);
}

function getUserAgent(request) {
  return request.headers.get("User-Agent") || "";
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
  if (typeof score === "number" && score <= 10) return true;

  return false;
}

/** 敏感页面的额外可疑信号：缺少 Accept: text/html 或 UA 含 bot/crawl/spider */
function hasSuspiciousSignals(request) {
  const accept = request.headers.get("Accept") || "";
  const ua = getUserAgent(request);

  if (isAdSensitivePage(new URL(request.url).pathname)) {
    if (!accept.includes("text/html") && !isGoodBot(request)) {
      return true;
    }
    if (/bot|crawl|spider/i.test(ua) && !isGoodBot(request)) {
      return true;
    }
  }

  return false;
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

  // AdSense / SEO 关键文件，永不拦截
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

  if (hasSuspiciousSignals(request)) {
    return blockResponse("suspicious", request);
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
      ip: request.headers.get("CF-Connecting-IP"),
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
    },
  });
}

/**
 * 为 HTML 响应附加安全响应头（静态资源不加，避免影响缓存/CDN）。
 */
export function applySecurityHeaders(response, pathname) {
  const headers = new Headers(response.headers);

  if (!isStaticOrApiPath(pathname)) {
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "SAMEORIGIN");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set("Permissions-Policy", "interest-cohort=()");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
