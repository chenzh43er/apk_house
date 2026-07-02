/**
 * state.html 广告加载优化：提升首屏 viewability、预加载 GPT、提前触发列表内竞价。
 */
(function (w) {
  var LIST_ROOT_MARGIN = "200px";
  var ASIDE_ROOT_MARGIN = "200px";

  function isLoaded(el) {
    return el && el.getAttribute("data-apk-ad-loaded") === "1";
  }

  function observeOnce(el, loaderFn, rootMargin) {
    if (!el || isLoaded(el)) {
      return;
    }

    var observer = new IntersectionObserver(
      function (entries, obs) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) {
            return;
          }
          loaderFn(entry.target);
          obs.unobserve(entry.target);
        });
      },
      { rootMargin: rootMargin || LIST_ROOT_MARGIN }
    );

    observer.observe(el);
  }

  function observeAll(selector, loaderFn, rootMargin) {
    document.querySelectorAll(selector).forEach(function (el) {
      observeOnce(el, loaderFn, rootMargin);
    });
  }

  w.ApkAdStatePage = {
    preloadGpt: function () {
      if (w.ApkAdLoader && w.ApkAdLoader.ensureGptSdk) {
        w.ApkAdLoader.ensureGptSdk();
      }
    },

    prepareTopBanner: function () {
      var el = document.getElementById("state_adv1");
      if (!el || typeof returnAdvWord !== "function") {
        return null;
      }
      el.innerHTML = returnAdvWord();
      return el;
    },

    loadTopBanner: function (el) {
      var node = el || document.getElementById("state_adv1");
      if (!node || isLoaded(node) || typeof loadState_adv1 !== "function") {
        return;
      }
      loadState_adv1(node);
    },

    initTopBannerWhenVisible: function () {
      var el = this.prepareTopBanner();
      if (!el) {
        return;
      }
      if (document.body.style.display !== "none") {
        this.loadTopBanner(el);
      }
    },

    observeInListAds: function () {
      observeAll(".state_advClass", loadState_adv3, LIST_ROOT_MARGIN);
    },

    observeMidContentAd: function (el) {
      if (!el || typeof returnAdvWord !== "function") {
        return;
      }
      el.innerHTML = returnAdvWord();
      observeOnce(el, loadState_adv3, LIST_ROOT_MARGIN);
    },

    observeAsideAd: function (el) {
      observeOnce(el, loadState_adv2, ASIDE_ROOT_MARGIN);
    },
  };
})(window);
