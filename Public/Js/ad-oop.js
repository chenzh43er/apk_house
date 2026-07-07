/**
 * ADX Out-of-Page：底部锚定 + Web 穿插广告。
 * 仅 ADX 模式；AdSense 模式不加载 gpt.js、不定义 OOP 位。
 * 非 de/us/de-ch-at index 落地页才运行。
 */
(function (w) {
  var DEMO_AD_UNIT = "/6355419/Travel/Europe/France/Paris";
  var interstitialInitialized = false;

  function isAdxMode() {
    return w.AD_CONFIG && w.AD_CONFIG.mode === "adx";
  }

  function isAdFreePage() {
    return (
      (w.AD_CONFIG && w.AD_CONFIG.adFree) ||
      (w.ApkAd && w.ApkAd.isAdFreePage && w.ApkAd.isAdFreePage())
    );
  }

  function isDesktopViewport() {
    if (w.innerWidth > 0 && w.innerWidth <= 768) {
      return false;
    }
    return w.matchMedia && w.matchMedia("(min-width: 769px)").matches;
  }

  function isMobileViewport() {
    return !isDesktopViewport();
  }

  function isAdxTestMode() {
    var testMode = w.AD_CONFIG && w.AD_CONFIG.adx && w.AD_CONFIG.adx.testMode;
    return testMode === true || testMode === "demo";
  }

  function getOopPath(def) {
    if (isAdxTestMode() && w.AD_CONFIG.adx.testMode === "demo") {
      return DEMO_AD_UNIT;
    }
    if (!def || !def.unit) {
      return null;
    }
    var networkCode =
      (w.AD_CONFIG && w.AD_CONFIG.adx && w.AD_CONFIG.adx.networkCode) ||
      "23357265712";
    return "/" + networkCode + "/" + def.unit;
  }

  function getFormatEnum(formatName) {
    var enums =
      w.googletag && w.googletag.enums && w.googletag.enums.OutOfPageFormat;
    return enums && enums[formatName];
  }

  function shouldEnableOop(key, oopConfig) {
    if (key === "bottom_anchor" && oopConfig.bottomAnchor === false) {
      return false;
    }
    if (key === "interstitial") {
      if (oopConfig.interstitial === false) {
        return false;
      }
      // 移动端默认关闭全屏穿插：体验差，且 body display:none→block 会误触发 unhideWindow
      if (isMobileViewport() && oopConfig.interstitialOnMobile !== true) {
        return false;
      }
    }
    if (key === "right_rail") {
      if (oopConfig.rightRail !== true) {
        return false;
      }
      if (!isDesktopViewport()) {
        return false;
      }
    }
    return true;
  }

  function isBodyVisible() {
    if (!document.body) {
      return false;
    }
    if (document.body.style.display === "none") {
      return false;
    }
    return document.body.offsetParent !== null || document.body.offsetWidth > 0;
  }

  function defineOopSlot(key, def, oopConfig) {
    var path = getOopPath(def);
    var format = getFormatEnum(def.format);
    if (!path || !format) {
      console.warn("[ApkAd] OOP config invalid:", key);
      return null;
    }

    var slot = w.googletag.defineOutOfPageSlot(path, format);
    if (!slot) {
      console.info(
        "[ApkAd] OOP slot not supported on this page/device:",
        key
      );
      return null;
    }

    if (def.format === "INTERSTITIAL" && slot.setConfig) {
      var triggers =
        oopConfig.interstitialTriggers ||
        { navBar: true, unhideWindow: true };
      slot.setConfig({
        interstitial: {
          triggers: triggers,
        },
      });
    }

    slot.addService(w.googletag.pubads());
    w.ApkAdLoader.registerOopSlot(key, slot);
    return slot;
  }

  function initInterstitialSlot() {
    if (
      interstitialInitialized ||
      !isAdxMode() ||
      isAdFreePage() ||
      !w.ApkAdLoader ||
      !w.ADX_OOP_DEFS
    ) {
      return Promise.resolve();
    }

    var oopConfig = (w.AD_CONFIG.adx && w.AD_CONFIG.adx.oop) || {};
    if (!shouldEnableOop("interstitial", oopConfig)) {
      return Promise.resolve();
    }

    interstitialInitialized = true;

    return w.ApkAdLoader.ensureGptSdk().then(function () {
      return new Promise(function (resolve) {
        w.googletag = w.googletag || { cmd: [] };
        w.googletag.cmd.push(function () {
          defineOopSlot("interstitial", w.ADX_OOP_DEFS.interstitial, oopConfig);
          resolve();
        });
      });
    });
  }

  function initDeferredInterstitial() {
    if (!isBodyVisible()) {
      return Promise.resolve();
    }
    return initInterstitialSlot().catch(function (err) {
      console.error("[ApkAd] deferred interstitial init failed:", err);
    });
  }

  function initOop() {
    if (!isAdxMode() || isAdFreePage()) {
      return;
    }
    if (!w.ApkAdLoader || !w.ADX_OOP_DEFS) {
      return;
    }

    var defs = w.ADX_OOP_DEFS;
    var oopConfig = (w.AD_CONFIG.adx && w.AD_CONFIG.adx.oop) || {};
    var deferred =
      w.ApkAdLoader.isSraBatchDeferred && w.ApkAdLoader.isSraBatchDeferred();

    w.ApkAdLoader.ensureGptSdk()
      .then(function () {
        w.googletag = w.googletag || { cmd: [] };
        w.googletag.cmd.push(function () {
          Object.keys(defs).forEach(function (key) {
            if (!shouldEnableOop(key, oopConfig)) {
              return;
            }
            // SRA batch 页 body 初始隐藏：interstitial 须等页面可见后再 define/display
            if (deferred && key === "interstitial") {
              return;
            }
            // 非 batch 页也等 body 可见再加载 interstitial，避免 vignette API 报错
            if (key === "interstitial" && !isBodyVisible()) {
              return;
            }
            if (key === "interstitial") {
              interstitialInitialized = true;
            }
            defineOopSlot(key, defs[key], oopConfig);
          });

          if (!deferred) {
            w.ApkAdLoader.ensureAdxServices();
          }
        });
        if (deferred) {
          w.ApkAdLoader.markOopDefined();
        }
      })
      .catch(function (err) {
        console.error("[ApkAd] OOP init failed:", err);
      });
  }

  w.ApkAdOop = {
    initDeferredInterstitial: initDeferredInterstitial,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initOop);
  } else {
    initOop();
  }
})(window);
