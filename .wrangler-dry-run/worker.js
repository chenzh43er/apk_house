var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker/traffic-guard.js
var GOOD_BOT_UA = /googlebot|adsbot-google|mediapartners-google|bingbot|applebot|duckduckbot|yandexbot|facebookexternalhit|twitterbot|linkedinbot|slackbot|discordbot|whatsapp|telegrambot/i;
var BAD_BOT_UA = /headless|phantomjs|puppeteer|selenium|playwright|webdriver|python-requests|python-urllib|scrapy|httpclient|java\/|libwww|wget|curl\/|httpx|go-http-client|axios\/|node-fetch|postman|insomnia|semrush|ahrefsbot|mj12bot|dotbot|petalbot|bytespider|gptbot|claudebot|ccbot/i;
var AD_SENSITIVE_RE = /\/(?:form|result)(?:\.html)?$|\/teach\/state\/[^/]+\/[^/]+\/[^/]+\/[^/]+\/(?:form|result)$/i;
function isStaticOrApiPath(pathname) {
  return pathname.startsWith("/cdn/") || pathname.startsWith("/Public/") || pathname.startsWith("/Assets/") || /\.(css|js|png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|eot|map|txt|xml)$/i.test(pathname) || /^\/(?:de|us|de-ch-at)\/(?:rest|rpc|storage|auth)/i.test(pathname);
}
__name(isStaticOrApiPath, "isStaticOrApiPath");
function isHtmlPage(pathname) {
  if (pathname === "/" || pathname === "/index.html" || pathname === "/language.html") {
    return true;
  }
  if (isStaticOrApiPath(pathname)) return false;
  if (/\.html$/i.test(pathname)) return true;
  return !/\.[a-z0-9]+$/i.test(pathname);
}
__name(isHtmlPage, "isHtmlPage");
function isAdSensitivePage(pathname) {
  return AD_SENSITIVE_RE.test(pathname);
}
__name(isAdSensitivePage, "isAdSensitivePage");
function getUserAgent(request) {
  return request.headers.get("User-Agent") || "";
}
__name(getUserAgent, "getUserAgent");
function isGoodBot(request) {
  const ua = getUserAgent(request);
  if (GOOD_BOT_UA.test(ua)) return true;
  const cf = request.cf;
  if (cf?.botManagement?.verifiedBot) return true;
  return false;
}
__name(isGoodBot, "isGoodBot");
function isBadBot(request) {
  const ua = getUserAgent(request);
  if (!ua.trim()) return true;
  if (BAD_BOT_UA.test(ua)) return true;
  const cf = request.cf;
  const score = cf?.botManagement?.score;
  if (typeof score === "number" && score <= 10) return true;
  return false;
}
__name(isBadBot, "isBadBot");
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
__name(hasSuspiciousSignals, "hasSuspiciousSignals");
function evaluateTrafficGuard(request) {
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
  if (hasSuspiciousSignals(request)) {
    return blockResponse("suspicious", request);
  }
  return null;
}
__name(evaluateTrafficGuard, "evaluateTrafficGuard");
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
      botScore: request.cf?.botManagement?.score ?? null
    })
  );
  return new Response("Forbidden", {
    status: 403,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow"
    }
  });
}
__name(blockResponse, "blockResponse");
function applySecurityHeaders(response, pathname) {
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
    headers
  });
}
__name(applySecurityHeaders, "applySecurityHeaders");

// worker/worker.js
var LANGS = ["de", "us", "de-ch-at"];
var LANG = LANGS.join("|");
var CDN_BUCKETS = {
  us: "HOUSEUS",
  de: "HOUSEPIC",
  at: "HOUSEAT",
  ch: "HOUSECH"
};
var ADS_TXT_BODY = "google.com, pub-2289697662900935, DIRECT, f08c47fec0942fa0\n";
var ROBOTS_TXT_BODY = `User-agent: *
Allow: /

User-agent: AdsBot-Google
Allow: /

User-agent: Mediapartners-Google
Allow: /

User-agent: Googlebot
Allow: /

Sitemap: https://apkintelligence.com/sitemap.xml
`;
async function passThrough(request, env, pathname) {
  let res;
  if (env.ASSETS) {
    res = await env.ASSETS.fetch(request);
  } else {
    res = await fetch(request);
  }
  return applySecurityHeaders(res, pathname || new URL(request.url).pathname);
}
__name(passThrough, "passThrough");
function rewrite(request, targetPath, params, env) {
  const url = new URL(request.url);
  const targetUrl = new URL(`${url.origin}${targetPath}`);
  for (const [key, value] of Object.entries(params)) {
    targetUrl.searchParams.set(key, decodeURIComponent(value));
  }
  return passThrough(new Request(targetUrl, request), env, targetPath);
}
__name(rewrite, "rewrite");
function getSupabaseOrigin(lang) {
  if (lang === "us") {
    return "https://uoxzcftzwemdrmcmhuhb.supabase.co";
  }
  if (lang === "de-ch-at") {
    const list = [
      "https://aabogtftiapiwehgmezt.supabase.co",
      "https://yioqqdprzzeqrlwfyqov.supabase.co",
      "https://zxvflhunzznslxzqreih.supabase.co"
    ];
    return list[Math.floor(Math.random() * list.length)];
  }
  if (lang === "de") {
    return "https://aabogtftiapiwehgmezt.supabase.co";
  }
}
__name(getSupabaseOrigin, "getSupabaseOrigin");
function serveCrawlerFile(pathname) {
  if (pathname === "/ads.txt") {
    return new Response(ADS_TXT_BODY, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=86400"
      }
    });
  }
  if (pathname === "/robots.txt") {
    return new Response(ROBOTS_TXT_BODY, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=86400"
      }
    });
  }
  return null;
}
__name(serveCrawlerFile, "serveCrawlerFile");
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
__name(r2ImageProxy, "r2ImageProxy");
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
__name(supabaseProxy, "supabaseProxy");
var worker_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const crawlerFile = serveCrawlerFile(pathname);
    if (crawlerFile) return crawlerFile;
    const blocked = evaluateTrafficGuard(request);
    if (blocked) return blocked;
    if (pathname === "/language.html" || pathname === "/index.html") {
      const target = new URL("/", request.url);
      target.search = url.search;
      return Response.redirect(target.toString(), 301);
    }
    if (pathname.startsWith("/cdn/")) {
      const imageRes = await r2ImageProxy(request, env, ctx);
      if (imageRes) return imageRes;
    }
    const apiMatch = pathname.match(
      new RegExp(`^\\/(${LANG})\\/(rest|rpc|storage|auth)`, "i")
    );
    if (apiMatch) {
      const lang = apiMatch[1];
      return supabaseProxy(request, lang, ctx);
    }
    if (/\.(css|js|png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|eot|map)$/i.test(pathname) || pathname.startsWith("/Public/") || pathname.startsWith("/Assets/")) {
      return passThrough(request, env, pathname);
    }
    let m = pathname.match(
      new RegExp(
        `^\\/(${LANG})\\/teach\\/state\\/([^/]+)\\/([^/]+)\\/([^/]+)\\/([^/]+)\\/result$`,
        "i"
      )
    );
    if (m) {
      const [, lang, state, city, district, id] = m;
      return rewrite(request, `/${lang}/result`, { id, state, city, district }, env);
    }
    m = pathname.match(
      new RegExp(
        `^\\/(${LANG})\\/teach\\/state\\/([^/]+)\\/([^/]+)\\/([^/]+)\\/([^/]+)\\/form$`,
        "i"
      )
    );
    if (m) {
      const [, lang, state, city, district, id] = m;
      return rewrite(request, `/${lang}/form`, { id, state, city, district }, env);
    }
    m = pathname.match(
      new RegExp(
        `^\\/(${LANG})\\/teach\\/state\\/([^/]+)\\/([^/]+)\\/([^/]+)\\/([^/]+)\\/detail$`,
        "i"
      )
    );
    if (m) {
      const [, lang, state, city, district, id] = m;
      return rewrite(request, `/${lang}/detail`, { id, state, city, district }, env);
    }
    m = pathname.match(
      new RegExp(
        `^\\/(${LANG})\\/teach\\/state\\/([^/]+)\\/([^/]+)\\/([^/]+)\\/(\\d+)\\/list$`,
        "i"
      )
    );
    if (m) {
      const [, lang, state, city, district, page] = m;
      return rewrite(request, `/${lang}/list`, { state, city, district, page }, env);
    }
    m = pathname.match(
      new RegExp(
        `^\\/(${LANG})\\/teach\\/state\\/([^/]+)\\/([^/]+)\\/district$`,
        "i"
      )
    );
    if (m) {
      const [, lang, state, city] = m;
      return rewrite(request, `/${lang}/district`, { state, city }, env);
    }
    m = pathname.match(
      new RegExp(`^\\/(${LANG})\\/teach\\/state\\/([^/]+)\\/city$`, "i")
    );
    if (m) {
      const [, lang, state] = m;
      return rewrite(request, `/${lang}/city`, { state }, env);
    }
    m = pathname.match(new RegExp(`^\\/(${LANG})\\/teach\\/state$`, "i"));
    if (m) {
      const [, lang] = m;
      return rewrite(request, `/${lang}/state`, {}, env);
    }
    m = pathname.match(
      new RegExp(`^\\/(${LANG})\\/post\\/(\\d+)\\/(\\d+)$`, "i")
    );
    if (m) {
      const [, , postid, page] = m;
      return rewrite(request, "/post", { postid, page }, env);
    }
    return passThrough(request, env, pathname);
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
