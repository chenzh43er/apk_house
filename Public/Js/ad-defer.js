/**
 * 页面 display:block（或首屏可见）之后再加载广告栈，避免阻塞 Supabase / 首屏渲染。
 *
 * 用法：
 *   document.body.style.display = "block";
 *   ApkAdDefer.load(["/Public/Js/ad-state-page.js?v=..."]).then(initPageAds);
 *   // 侧栏等异步 DOM：ApkAdDefer.whenReady(function () { ... });
 */
(function (w) {
  var CORE = [
    "/Public/Js/ad-config.js?v=20260831anchorfix1",
    "/Public/Js/ad-slots-adx.js",
    "/Public/Js/ad-loader.js?v=20250718k",
    "/Public/Js/ad-runtime.js?v=20260831freeze1",
    "/Public/Js/ad-oop.js?v=20250718k",
  ];

  var loadPromise = null;
  var readyResolve = null;
  var readyPromise = new Promise(function (resolve) {
    readyResolve = resolve;
  });

  function googleAdsSrc() {
    try {
      return new URL(
        "./Public/Js/googleAds_Test.js",
        document.baseURI || w.location.href
      ).href;
    } catch (e) {
      return "/us/Public/Js/googleAds_Test.js";
    }
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[src="' + src + '"]');
      if (existing) {
        if (existing.getAttribute("data-apk-defer-loaded") === "1") {
          resolve();
          return;
        }
        existing.addEventListener("load", function () {
          resolve();
        });
        existing.addEventListener("error", function () {
          reject(new Error("Failed to load " + src));
        });
        return;
      }
      var s = document.createElement("script");
      s.src = src;
      s.async = false;
      s.onload = function () {
        s.setAttribute("data-apk-defer-loaded", "1");
        resolve();
      };
      s.onerror = function () {
        reject(new Error("Failed to load " + src));
      };
      (document.head || document.documentElement).appendChild(s);
    });
  }

  function normalizeExtra(extra) {
    if (!extra) return [];
    if (typeof extra === "string") return [extra];
    if (Array.isArray(extra)) return extra.filter(Boolean);
    return [];
  }

  /**
   * @param {string|string[]} [extra] 核心栈之后的额外脚本（如 ad-state-page.js）
   * @returns {Promise<void>}
   */
  function load(extra) {
    if (loadPromise) {
      return loadPromise;
    }
    var scripts = [CORE[0], googleAdsSrc()]
      .concat(CORE.slice(1))
      .concat(normalizeExtra(extra));

    loadPromise = scripts
      .reduce(function (chain, src) {
        return chain.then(function () {
          return loadScript(src);
        });
      }, Promise.resolve())
      .then(function () {
        readyResolve();
      })
      .catch(function (err) {
        console.warn("[ApkAdDefer]", err && err.message ? err.message : err);
        readyResolve();
      });

    return loadPromise;
  }

  /** 广告栈就绪后执行（若尚未 load，会等到首次 load 完成） */
  function whenReady(fn) {
    return readyPromise.then(fn);
  }

  w.ApkAdDefer = {
    load: load,
    whenReady: whenReady,
  };
})(window);
