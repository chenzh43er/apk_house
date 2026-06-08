import { applySecurityHeaders, evaluateTrafficGuard } from "./traffic-guard.js";

const LANGS = ["de", "us", "de-ch-at"];
const LANG = LANGS.join("|");

/** 本地 Pages dev 用 ASSETS；线上 Zone Worker 用 fetch 回源 Pages */
async function passThrough(request, env, pathname) {
  let res;
  if (env.ASSETS) {
    res = await env.ASSETS.fetch(request);
  } else {
    res = await fetch(request);
  }
  return applySecurityHeaders(res, pathname || new URL(request.url).pathname);
}

function rewrite(request, targetPath, params, env) {
  const url = new URL(request.url);
  const targetUrl = new URL(`${url.origin}${targetPath}`);

  for (const [key, value] of Object.entries(params)) {
    targetUrl.searchParams.set(key, decodeURIComponent(value));
  }

  return passThrough(new Request(targetUrl, request), env, targetPath);
}

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

const CDN_BUCKETS = {
  us: "HOUSEUS",
  de: "HOUSEPIC",
  at: "HOUSEAT",
  ch: "HOUSECH",
};

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

    // AdSense 验证文件：优先回源，不经过 traffic-guard
    if (pathname === "/ads.txt" || pathname === "/robots.txt") {
      return passThrough(request, env, pathname);
    }

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

    if (
      /\.(css|js|png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|eot|map)$/i.test(pathname) ||
      pathname.startsWith("/Public/") ||
      pathname.startsWith("/Assets/")
    ) {
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
      return rewrite(request, `/${lang}/result`, {
        id,
        state,
        city,
        district
      }, env);
    }

    m = pathname.match(
      new RegExp(
        `^\\/(${LANG})\\/teach\\/state\\/([^/]+)\\/([^/]+)\\/([^/]+)\\/([^/]+)\\/form$`,
        "i"
      )
    );
    if (m) {
      const [, lang, state, city, district, id] = m;
      return rewrite(request, `/${lang}/form`, {
        id,
        state,
        city,
        district
      }, env);
    }

    m = pathname.match(
      new RegExp(
        `^\\/(${LANG})\\/teach\\/state\\/([^/]+)\\/([^/]+)\\/([^/]+)\\/([^/]+)\\/detail$`,
        "i"
      )
    );
    if (m) {
      const [, lang, state, city, district, id] = m;
      return rewrite(request, `/${lang}/detail`, {
        id,
        state,
        city,
        district
      }, env);
    }

    m = pathname.match(
      new RegExp(
        `^\\/(${LANG})\\/teach\\/state\\/([^/]+)\\/([^/]+)\\/([^/]+)\\/(\\d+)\\/list$`,
        "i"
      )
    );
    if (m) {
      const [, lang, state, city, district, page] = m;
      return rewrite(request, `/${lang}/list`, {
        state,
        city,
        district,
        page
      }, env);
    }

    m = pathname.match(
      new RegExp(
        `^\\/(${LANG})\\/teach\\/state\\/([^/]+)\\/([^/]+)\\/district$`,
        "i"
      )
    );
    if (m) {
      const [, lang, state, city] = m;
      return rewrite(request, `/${lang}/district`, {
        state,
        city
      }, env);
    }

    m = pathname.match(
      new RegExp(
        `^\\/(${LANG})\\/teach\\/state\\/([^/]+)\\/city$`,
        "i"
      )
    );
    if (m) {
      const [, lang, state] = m;
      return rewrite(request, `/${lang}/city`, {
        state
      }, env);
    }

    m = pathname.match(
      new RegExp(`^\\/(${LANG})\\/teach\\/state$`, "i")
    );
    if (m) {
      const [, lang] = m;
      return rewrite(request, `/${lang}/state`, {}, env);
    }

    m = pathname.match(
      new RegExp(`^\\/(${LANG})\\/post\\/(\\d+)\\/(\\d+)$`, "i")
    );
    if (m) {
      const [, , postid, page] = m;
      return rewrite(request, `/post`, {
        postid,
        page
      }, env);
    }

    return passThrough(request, env, pathname);
  }
};
