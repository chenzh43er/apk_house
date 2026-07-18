/**
 * ADX Out-of-Page：底部锚定 + Web 穿插广告。
 * 仅 ADX 模式；AdSense 模式不加载 gpt.js、不定义 OOP 位。
 * 非 de/us/de-ch-at index 落地页才运行。
 *
 * 底部锚定可见率：本站多页 body 初始 display:none，若此时 display 锚定条，
 * 会先记印象再无法满足 Active View。手机再额外短延迟，过滤秒退流量。
 */
(function (w) {
  var DEMO_AD_UNIT = "/6355419/Travel/Europe/France/Paris";
  var bottomAnchorDisplayScheduled = false;
  var bottomAnchorDisplayed = false;
  var bodyWatchStarted = false;

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

  function getOopConfig() {
    return (w.AD_CONFIG && w.AD_CONFIG.adx && w.AD_CONFIG.adx.oop) || {};
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

  function shouldDeferInterstitialDisplay() {
    return !isBodyVisible();
  }

  /** 页面未可见时必须延迟；手机再额外停留，提高 Active View 命中率 */
  function shouldDeferBottomAnchorDisplay() {
    if (!isBodyVisible()) {
      return true;
    }
    return isMobileViewport();
  }

  function getBottomAnchorDelayMs() {
    if (!isMobileViewport()) {
      return 0;
    }
    var oopConfig = getOopConfig();
    var ms = oopConfig.bottomAnchorMobileDelayMs;
    if (ms == null || ms === false) {
      return 1200;
    }
    return Math.max(0, Number(ms) || 0);
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

    var registerOptions = null;
    if (key === "interstitial" && shouldDeferInterstitialDisplay()) {
      // 提前 define 注册 interstitial API，避免 banner 收到 vignette 创意时报错
      registerOptions = { autoDisplay: false };
    }
    if (key === "bottom_anchor" && shouldDeferBottomAnchorDisplay()) {
      registerOptions = { autoDisplay: false };
    }

    w.ApkAdLoader.registerOopSlot(key, slot, registerOptions);

    if (key === "bottom_anchor" && registerOptions && registerOptions.autoDisplay === false) {
      scheduleBottomAnchorDisplay();
      watchBodyVisibleForOop();
    }

    return slot;
  }

  function displayBottomAnchorNow() {
    if (bottomAnchorDisplayed || !w.ApkAdLoader) {
      return false;
    }
    if (!isBodyVisible()) {
      return false;
    }
    if (
      w.ApkAdLoader.displayOopSlotByKey &&
      w.ApkAdLoader.displayOopSlotByKey("bottom_anchor")
    ) {
      bottomAnchorDisplayed = true;
      return true;
    }
    return false;
  }

  function scheduleBottomAnchorDisplay() {
    if (bottomAnchorDisplayScheduled || bottomAnchorDisplayed) {
      return;
    }
    bottomAnchorDisplayScheduled = true;

    function runWhenReady() {
      if (bottomAnchorDisplayed) {
        return;
      }
      if (!isBodyVisible()) {
        bottomAnchorDisplayScheduled = false;
        watchBodyVisibleForOop();
        return;
      }
      var delay = getBottomAnchorDelayMs();
      w.setTimeout(function () {
        if (bottomAnchorDisplayed) {
          return;
        }
        if (!isBodyVisible()) {
          bottomAnchorDisplayScheduled = false;
          watchBodyVisibleForOop();
          return;
        }
        displayBottomAnchorNow();
      }, delay);
    }

    runWhenReady();
  }

  function watchBodyVisibleForOop() {
    if (bodyWatchStarted || typeof MutationObserver === "undefined") {
      return;
    }
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", watchBodyVisibleForOop);
      return;
    }
    if (isBodyVisible()) {
      scheduleBottomAnchorDisplay();
      return;
    }
    bodyWatchStarted = true;
    var obs = new MutationObserver(function () {
      if (!isBodyVisible()) {
        return;
      }
      obs.disconnect();
      bodyWatchStarted = false;
      scheduleBottomAnchorDisplay();
      initDeferredInterstitial();
    });
    obs.observe(document.body, {
      attributes: true,
      attributeFilter: ["style", "class", "hidden"],
    });
  }

  function initDeferredInterstitial() {
    if (!isBodyVisible() || !w.ApkAdLoader) {
      return Promise.resolve();
    }

    return w.ApkAdLoader.ensureGptSdk().then(function () {
      return new Promise(function (resolve) {
        w.googletag = w.googletag || { cmd: [] };
        w.googletag.cmd.push(function () {
          if (
            w.ApkAdLoader.displayOopSlotByKey &&
            w.ApkAdLoader.displayOopSlotByKey("interstitial")
          ) {
            resolve();
            return;
          }

          if (!w.ADX_OOP_DEFS || !w.ADX_OOP_DEFS.interstitial) {
            resolve();
            return;
          }

          var oopConfig = getOopConfig();
          if (!shouldEnableOop("interstitial", oopConfig)) {
            resolve();
            return;
          }

          defineOopSlot("interstitial", w.ADX_OOP_DEFS.interstitial, oopConfig);
          if (w.ApkAdLoader.displayOopSlotByKey) {
            w.ApkAdLoader.displayOopSlotByKey("interstitial");
          }
          resolve();
        });
      });
    }).catch(function () {
      /* GPT load errors are logged once in ad-loader ensureGptSdk */
    });
  }

  /** body 可见后：补展示延迟的 interstitial + bottom_anchor */
  function notifyBodyVisible() {
    scheduleBottomAnchorDisplay();
    return initDeferredInterstitial();
  }

  function initOop() {
    if (!isAdxMode() || isAdFreePage()) {
      return;
    }
    if (!w.ApkAdLoader || !w.ADX_OOP_DEFS) {
      return;
    }

    var defs = w.ADX_OOP_DEFS;
    var oopConfig = getOopConfig();
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
      .catch(function () {
        /* GPT load errors are logged once in ad-loader ensureGptSdk */
      });
  }

  w.ApkAdOop = {
    initDeferredInterstitial: initDeferredInterstitial,
    notifyBodyVisible: notifyBodyVisible,
    scheduleBottomAnchorDisplay: scheduleBottomAnchorDisplay,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initOop);
  } else {
    initOop();
  }
})(window);
