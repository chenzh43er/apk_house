/**
 * 选择器页 head 尽早启动：preconnect Supabase、预加载 SDK、预取静态州/市 JSON。
 * 依赖：getLangFromPath（utlParam/common）、ensureSupabase（common）。
 */
(function (w) {
  var SUPABASE_HOST = {
    us: "https://uoxzcftzwemdrmcmhuhb.supabase.co",
    de: "https://aabogtftiapiwehgmezt.supabase.co",
    ch: "https://yioqqdprzzeqrlwfyqov.supabase.co",
    at: "https://zxvflhunzznslxzqreih.supabase.co",
  };

  var SDK = "/Public/Js/supabase.min.js?v=20260819lock1";

  function getLang() {
    if (typeof getLangFromPath === "function") return getLangFromPath();
    var segs = (w.location.pathname || "").split("/");
    return segs[1] || "us";
  }

  function getCountry() {
    try {
      return new URLSearchParams(w.location.search).get("country");
    } catch (e) {
      return null;
    }
  }

  function pickerRegion(lang, country) {
    if (lang === "us") return "us";
    if (lang === "de") return "de";
    if (lang === "de-ch-at") {
      if (country === "ch") return "ch";
      if (country === "at") return "at";
      return "de";
    }
    if (country === "ch") return "ch";
    if (country === "at") return "at";
    return "de";
  }

  function supabaseHostFor(lang, country) {
    var region = pickerRegion(lang, country);
    return SUPABASE_HOST[region] || SUPABASE_HOST.de;
  }

  function ensureLink(rel, href, attrs) {
    if (!href || !document.head) return;
    var sel = 'link[rel="' + rel + '"][href="' + href + '"]';
    if (document.head.querySelector(sel)) return;
    var link = document.createElement("link");
    link.rel = rel;
    link.href = href;
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        link.setAttribute(k, attrs[k]);
      });
    }
    document.head.appendChild(link);
  }

  function preconnect(host) {
    if (!host) return;
    ensureLink("dns-prefetch", host);
    ensureLink("preconnect", host, { crossorigin: "" });
  }

  function preloadScript(src) {
    ensureLink("preload", src, { as: "script" });
  }

  function preloadFetch(url) {
    ensureLink("preload", url, { as: "fetch", crossorigin: "" });
  }

  function prefetchJson(url) {
    if (!url) return Promise.resolve(null);
    return fetch(url, { credentials: "omit" })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (data) {
        return Array.isArray(data) && data.length ? data : null;
      })
      .catch(function () {
        return null;
      });
  }

  function stateFromLocation() {
    try {
      var url = new URL(w.location.href);
      if (url.searchParams.has("state")) {
        return decodeURIComponent(url.searchParams.get("state"));
      }
      var m = url.pathname.match(
        /^\/(?:(?:de|de-ch-at)(?:\/teach\/state)?|us\/teach\/state)\/([^/]+)(?:\/(?:city|district)|\/[^/]+\/district)?\/?$/i
      );
      // city page: /us/teach/state/{state}/city
      var mCity = url.pathname.match(
        /^\/(?:(?:de|de-ch-at)(?:\/teach\/state)?|us\/teach\/state)\/([^/]+)\/city\/?$/i
      );
      if (mCity) return decodeURIComponent(mCity[1]);
      var mDist = url.pathname.match(
        /^\/(?:(?:de|de-ch-at)(?:\/teach\/state)?|us\/teach\/state)\/([^/]+)\/([^/]+)\/district\/?$/i
      );
      if (mDist) return decodeURIComponent(mDist[1]);
      // rewritten /us/city?state=
      return null;
    } catch (e) {
      return null;
    }
  }

  function cityFromLocation() {
    try {
      var url = new URL(w.location.href);
      if (url.searchParams.has("city")) {
        return decodeURIComponent(url.searchParams.get("city"));
      }
      var mDist = url.pathname.match(
        /^\/(?:(?:de|de-ch-at)(?:\/teach\/state)?|us\/teach\/state)\/([^/]+)\/([^/]+)\/district\/?$/i
      );
      if (mDist) return decodeURIComponent(mDist[2]);
      return null;
    } catch (e) {
      return null;
    }
  }

  function pageKind() {
    var path = (w.location.pathname || "").toLowerCase();
    if (/\/district(?:\.html)?$/.test(path) || /\/district\/?$/.test(path)) {
      return "district";
    }
    if (/\/city(?:\.html)?$/.test(path) || /\/city\/?$/.test(path)) {
      return "city";
    }
    // /us/city?state= after rewrite
    if (/\/city(?:\.html)?$/i.test(path)) return "city";
    if (/\/district(?:\.html)?$/i.test(path)) return "district";
    if (/\/state(?:\.html)?$/i.test(path) || /\/teach\/state\/?$/i.test(path)) {
      return "state";
    }
    return "state";
  }

  function boot() {
    var lang = getLang();
    var country = getCountry();
    var region = pickerRegion(lang, country);
    var host = supabaseHostFor(lang, country);
    var kind = pageKind();

    preconnect(host);
    preloadScript(SDK);

    if (typeof ensureSupabase === "function") {
      ensureSupabase();
    }

    var statesUrl = "/Public/Data/" + region + "/states.json";
    if (kind === "state") {
      preloadFetch(statesUrl);
      w.__apkStatesPrefetch = prefetchJson(statesUrl);
    }

    if (kind === "city" || kind === "district") {
      var state = stateFromLocation();
      if (!state) {
        try {
          state = new URLSearchParams(w.location.search).get("state");
          if (state) state = decodeURIComponent(state);
        } catch (e) {}
      }
      if (state) {
        var citiesUrl =
          "/Public/Data/" +
          region +
          "/cities/" +
          encodeURIComponent(state) +
          ".json";
        preloadFetch(citiesUrl);
        w.__apkCitiesPrefetch = prefetchJson(citiesUrl);
        w.__apkCitiesPrefetchKey = region + "|" + state;
      }
    }

    if (kind === "district") {
      var st = stateFromLocation();
      var city = cityFromLocation();
      if (!st) {
        try {
          st = new URLSearchParams(w.location.search).get("state");
          if (st) st = decodeURIComponent(st);
        } catch (e) {}
      }
      if (!city) {
        try {
          city = new URLSearchParams(w.location.search).get("city");
          if (city) city = decodeURIComponent(city);
        } catch (e) {}
      }
      if (st && city) {
        var distUrl =
          "/Public/Data/" +
          region +
          "/districts/" +
          encodeURIComponent(st) +
          "/" +
          encodeURIComponent(city) +
          ".json";
        preloadFetch(distUrl);
        w.__apkDistrictsPrefetch = prefetchJson(distUrl);
        w.__apkDistrictsPrefetchKey = region + "|" + st + "|" + city;
      }
    }

    w.ApkPickerBoot = {
      region: region,
      host: host,
      kind: kind,
    };
  }

  boot();
})(window);
