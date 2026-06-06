const LANGS = ["de", "us", "de-ch-at"];
const LANG = LANGS.join("|");

/**
 * URL rewrite helper
 */
function rewrite(request, targetPath, params = {}) {
  const url = new URL(request.url);
  const targetUrl = new URL(`${url.origin}${targetPath}`);

  for (const [key, value] of Object.entries(params)) {
    targetUrl.searchParams.set(key, decodeURIComponent(value));
  }

  return fetch(new Request(targetUrl, request));
}

/**
 * Supabase multi-origin router
 */
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

/**
 * Supabase proxy
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
      return fetch(request);
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
      });
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
      });
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
      });
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
      });
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
      });
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
      });
    }

    m = pathname.match(
      new RegExp(`^\\/(${LANG})\\/teach\\/state$`, "i")
    );
    if (m) {
      const [, lang] = m;
      return rewrite(request, `/${lang}/state`);
    }

    m = pathname.match(
      new RegExp(`^\\/(${LANG})\\/post\\/(\\d+)\\/(\\d+)$`, "i")
    );
    if (m) {
      const [, , postid, page] = m;
      return rewrite(request, `/post`, {
        postid,
        page
      });
    }

    return fetch(request);
  }
};
