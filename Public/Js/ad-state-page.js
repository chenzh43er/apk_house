/**
 * state.html 广告加载优化：提升首屏 viewability、预加载 GPT、SRA 首屏 batch define。
 */
(function (w) {
  var LIST_ROOT_MARGIN = "200px";
  var ASIDE_ROOT_MARGIN = "200px";
  var aboveFoldBatchDone = false;
  var pendingAboveFoldBatch = null;

  function isBodyVisible() {
    if (!document.body || document.body.style.display === "none") {
      return false;
    }
    return true;
  }

  function commitAboveFoldBatch(topEl, midEl) {
    if (aboveFoldBatchDone || !topEl || !w.ApkAdLoader) {
      return;
    }
    w.ApkAdLoader.commitSraBatch();
    w.ApkAdLoader.displayAdxElement(topEl);
    if (midEl) {
      w.ApkAdLoader.displayAdxElement(midEl);
    }
    aboveFoldBatchDone = true;
    pendingAboveFoldBatch = null;
  }

  function tryCommitAboveFoldBatch() {
    if (!pendingAboveFoldBatch || !isBodyVisible()) {
      return;
    }
    commitAboveFoldBatch(
      pendingAboveFoldBatch.topEl,
      pendingAboveFoldBatch.midEl
    );
  }

  function isAdxMode() {
    return w.AD_CONFIG && w.AD_CONFIG.mode === "adx";
  }

  function isAdFreePage() {
    return (
      (w.AD_CONFIG && w.AD_CONFIG.adFree) ||
      (w.ApkAd && w.ApkAd.isAdFreePage && w.ApkAd.isAdFreePage())
    );
  }

  function isStatePage() {
    return w.document.body && w.document.body.classList.contains("page-state");
  }

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

  function prepareMidContentAd() {
    var el = document.getElementById("state_adv_mid");
    if (!el || typeof returnAdvWord !== "function") {
      return null;
    }
    el.innerHTML = returnAdvWord();
    return el;
  }

  function initAboveFoldBatch() {
    if (
      aboveFoldBatchDone ||
      !isStatePage() ||
      isAdFreePage() ||
      !isAdxMode() ||
      !w.ApkAdLoader
    ) {
      return;
    }

    var topEl = w.ApkAdStatePage.prepareTopBanner();
    var midEl = prepareMidContentAd();
    if (!topEl) {
      return;
    }

    w.ApkAdLoader.ensureGptSdk()
      .then(function () {
        return w.ApkAdLoader.whenOopReady();
      })
      .then(function () {
        var tasks = [w.ApkAdLoader.defineAdxSlot("state_adv1", topEl)];
        if (midEl) {
          tasks.push(w.ApkAdLoader.defineAdxSlot("state_adv3", midEl));
        }
        return Promise.all(tasks);
      })
      .then(function () {
        if (isBodyVisible()) {
          commitAboveFoldBatch(topEl, midEl);
        } else {
          pendingAboveFoldBatch = { topEl: topEl, midEl: midEl };
        }
      })
      .catch(function (err) {
        console.error("[ApkAd] state above-fold SRA batch failed:", err);
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
      if (aboveFoldBatchDone) {
        return;
      }
      var el = this.prepareTopBanner();
      if (!el) {
        return;
      }
      if (document.body.style.display !== "none") {
        this.loadTopBanner(el);
      }
    },

    initAboveFoldBatch: initAboveFoldBatch,

    isAboveFoldBatchDone: function () {
      return aboveFoldBatchDone;
    },

    observeInListAds: function () {
      observeAll(".state_advClass", loadState_adv3, LIST_ROOT_MARGIN);
    },

    observeMidContentAd: function (el) {
      if (aboveFoldBatchDone) {
        return;
      }
      if (!el || typeof returnAdvWord !== "function") {
        return;
      }
      el.innerHTML = returnAdvWord();
      observeOnce(el, loadState_adv3, LIST_ROOT_MARGIN);
    },

    observeAsideAd: function (el) {
      observeOnce(el, loadState_adv2, ASIDE_ROOT_MARGIN);
    },

    notifyBodyVisible: function () {
      tryCommitAboveFoldBatch();
      if (w.ApkAdOop && w.ApkAdOop.initDeferredInterstitial) {
        w.ApkAdOop.initDeferredInterstitial();
      }
    },
  };

  function onDomReady() {
    initAboveFoldBatch();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onDomReady);
  } else {
    onDomReady();
  }
})(window);
