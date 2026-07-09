/**
 * houseworker — identityinsight.org 统一边缘 Worker
 *
 * 功能模块（按请求处理顺序）：
 *  1. SEO/AdSense 爬虫文件（ads.txt、robots.txt）
 *  2. 首页重定向（/index.html、/language.html → /）
 *  3. R2 CDN 图片代理（/cdn/{region}/...）
 *  4. Supabase API 反向代理（/{lang}/rest|rpc|storage|auth）
 *  5. 静态资源透传（CSS/JS/图片/Public/Assets）
 *  6. SEO 友好 URL 重写（teach/state 路径 → 实际 HTML 页面）
 *  7. 文章路径重写（/{lang}/post/{id}/{page} → /{lang}/post）
 *  8. 默认透传（其余 HTML 页面回源 Pages）
 */

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
const PAGES_ORIGIN = "https://apk-house-2nz.pages.dev";

/**
 * 静态资源 / HTML 回源 Pages。
 * 本地 dev 使用 ASSETS binding；线上 Zone Worker 回源 apk-house-2nz.pages.dev。
 */
async function passThrough(request, env, pathname) {
  if (env.ASSETS) {
    return env.ASSETS.fetch(request);
  }

  const reqUrl = new URL(request.url);
  const path = pathname || reqUrl.pathname;
  const pagesUrl = new URL(path + reqUrl.search, PAGES_ORIGIN);
  return fetch(
    new Request(pagesUrl, {
      method: request.method,
      headers: request.headers,
      body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
      redirect: "follow",
    })
  );
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

    // ── 1. SEO / AdSense 爬虫文件 ──
    const crawlerFile = serveCrawlerFile(pathname);
    if (crawlerFile) return crawlerFile;

    // ── 2. 首页规范化重定向 ──
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

    // ── 3. R2 CDN 图片代理 ──
    if (pathname.startsWith("/cdn/")) {
      const imageRes = await r2ImageProxy(request, env, ctx);
      if (imageRes) return imageRes;
    }

    // ── 4. Supabase API 反向代理 ──
    const apiMatch = pathname.match(
      new RegExp(`^\\/(${LANG})\\/(rest|rpc|storage|auth)`, "i")
    );
    if (apiMatch) {
      const lang = apiMatch[1];
      return supabaseProxy(request, lang, ctx);
    }

    // ── 5. 静态资源透传 ──
    if (
      /\.(css|js|png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|eot|map)$/i.test(pathname) ||
      pathname.startsWith("/Public/") ||
      pathname.startsWith("/Assets/")
    ) {
      return passThrough(request, env, pathname);
    }

    // ── 6. SEO 友好 URL 重写（teach/state 层级路径） ──
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

    // ── 7. 文章路径重写：/{lang}/post/{postid}/{page} → /{lang}/post?postid=...&page=... ──
    m = pathname.match(
      new RegExp(`^\\/(${LANG})\\/post\\/(\\d+)\\/(\\d+)$`, "i")
    );
    if (m) {
      const [, lang, postid, page] = m;
      return rewrite(request, `/${lang}/post`, { postid, page }, env);
    }

    // ── 8. 默认透传：其余 HTML 页面回源 Pages ──
    return passThrough(request, env, pathname);
  },
};
