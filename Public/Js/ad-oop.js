/**
 * ADX Out-of-Page：底部锚定 + Web 穿插广告。
 *
 * 锚定可见率：
 * - 生产环境：body 可见后才 define（避免 SRA 在 display:none 时一并请求）
 * - 本地 / adtest=demo：可提前 define、body 可见后再 display（方便验证）
 *
 * GPT 限制：BOTTOM_ANCHOR 仅在顶层窗口 + 竖屏 + 宽度约 320–1000px 时
 * defineOutOfPageSlot 才会成功；常见 PC 最大化窗口会返回 null。
 */
(function (w) {
  var DEMO_AD_UNIT = "/6355419/Travel";
  var bottomAnchorDefined = false;
  var bottomAnchorDisplayed = false;
  var bottomAnchorTimer = null;
  var bodyWatchStarted = false;
  var resizeWatchStarted = false;

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
    return !!(w.matchMedia && w.matchMedia("(min-width: 769px)").matches);
  }

  function isMobileViewport() {
    return !isDesktopViewport();
  }

  function isLocalHost() {
    var host = w.location.hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  }

  function isAdxTestMode() {
    var testMode = w.AD_CONFIG && w.AD_CONFIG.adx && w.AD_CONFIG.adx.testMode;
    return testMode === true || testMode === "demo";
  }

  function isDemoMode() {
    return w.AD_CONFIG && w.AD_CONFIG.adx && w.AD_CONFIG.adx.testMode === "demo";
  }

  /** 本地/demo 可提前 define；生产延迟 define 防 SRA */
  function useEarlyDefineForTest() {
    return isLocalHost() || isDemoMode();
  }

  function getOopConfig() {
    return (w.AD_CONFIG && w.AD_CONFIG.adx && w.AD_CONFIG.adx.oop) || {};
  }

  function getOopPath(def) {
    if (isDemoMode()) {
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
    if (document.body.hasAttribute("hidden")) {
      return false;
    }
    if (w.getComputedStyle) {
      var cs = w.getComputedStyle(document.body);
      if (cs.display === "none" || cs.visibility === "hidden") {
        return false;
      }
    }
    return document.body.offsetWidth > 0 || document.body.offsetHeight > 0;
  }

  function isAnchorViewportSupported() {
    var width = w.innerWidth || 0;
    var height = w.innerHeight || 0;
    var portrait = height >= width;
    return width >= 320 && width <= 1000 && portrait;
  }

  function shouldDeferInterstitialDisplay() {
    return !isBodyVisible();
  }

  function getBottomAnchorDelayMs() {
    if (isLocalHost() || isDemoMode()) {
      return 0;
    }
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

  function logAnchor(msg, detail) {
    if (!isLocalHost() && w.location.search.indexOf("addebug=1") < 0) {
      return;
    }
    if (detail !== undefined) {
      console.info("[ApkAd][anchor]", msg, detail);
    } else {
      console.info("[ApkAd][anchor]", msg);
    }
  }

  function warnAnchor(msg, detail) {
    if (detail !== undefined) {
      console.warn("[ApkAd][anchor]", msg, detail);
    } else {
      console.warn("[ApkAd][anchor]", msg);
    }
  }

  function defineOopSlot(key, def, oopConfig, options) {
    var path = getOopPath(def);
    var format = getFormatEnum(def.format);
    if (!path || !format) {
      warnAnchor("OOP config invalid", {
        key: key,
        path: path,
        formatName: def && def.format,
        hasEnums: !!(w.googletag && w.googletag.enums),
      });
      return null;
    }

    var slot = w.googletag.defineOutOfPageSlot(path, format);
    if (!slot) {
      warnAnchor(
        "defineOutOfPageSlot returned null — GPT 不支持当前视口的锚定格式",
        {
          key: key,
          path: path,
          width: w.innerWidth,
          height: w.innerHeight,
          tip:
            "需要竖屏且宽度约 320–1000px。PC 请开 DevTools 设备模式后【刷新】，或把窗口缩到 ≤1000px。" +
            "也可试 #gamBottomAnchorDemo",
        }
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

    var registerOptions = options || null;
    if (
      !registerOptions &&
      key === "interstitial" &&
      shouldDeferInterstitialDisplay()
    ) {
      registerOptions = { autoDisplay: false };
    }

    w.ApkAdLoader.registerOopSlot(key, slot, registerOptions);
    return slot;
  }

  function displayBottomAnchor() {
    if (bottomAnchorDisplayed || !w.ApkAdLoader) {
      return false;
    }
    if (!isBodyVisible()) {
      return false;
    }
    if (w.ApkAdLoader.ensureAdxServices) {
      w.ApkAdLoader.ensureAdxServices();
    }
    if (
      w.ApkAdLoader.displayOopSlotByKey &&
      w.ApkAdLoader.displayOopSlotByKey("bottom_anchor")
    ) {
      bottomAnchorDisplayed = true;
      logAnchor("displayed");
      return true;
    }
    return false;
  }

  function defineBottomAnchorNow(autoDisplay) {
    if (bottomAnchorDefined || !w.ApkAdLoader || !w.ADX_OOP_DEFS) {
      return false;
    }
    var oopConfig = getOopConfig();
    if (!shouldEnableOop("bottom_anchor", oopConfig)) {
      return false;
    }
    var def = w.ADX_OOP_DEFS.bottom_anchor;
    if (!def) {
      return false;
    }

    if (!isAnchorViewportSupported()) {
      warnAnchor("当前视口不满足 GPT 锚定条件，跳过 define", {
        width: w.innerWidth,
        height: w.innerHeight,
      });
      watchAnchorViewport();
      return false;
    }

    var slot = defineOopSlot("bottom_anchor", def, oopConfig, {
      autoDisplay: autoDisplay === true,
    });
    if (!slot) {
      watchAnchorViewport();
      return false;
    }

    bottomAnchorDefined = true;
    if (autoDisplay === true) {
      bottomAnchorDisplayed = true;
    }
    logAnchor("defined", { autoDisplay: !!autoDisplay, path: getOopPath(def) });
    return true;
  }

  function runAnchorWhenReady() {
    w.googletag = w.googletag || { cmd: [] };
    w.googletag.cmd.push(function () {
      if (!isBodyVisible()) {
        logAnchor("body still hidden in cmd");
        watchBodyVisibleForOop();
        return;
      }

      if (!bottomAnchorDefined) {
        // 生产：此时才 define；本地/demo：通常已 early define
        if (!defineBottomAnchorNow(false)) {
          return;
        }
      }

      if (w.ApkAdLoader.ensureAdxServices) {
        w.ApkAdLoader.ensureAdxServices();
      }
      displayBottomAnchor();
    });
  }

  function scheduleBottomAnchorDisplay() {
    if (bottomAnchorDisplayed) {
      return;
    }
    if (bottomAnchorTimer != null) {
      return;
    }
    if (!isBodyVisible()) {
      logAnchor("wait body visible");
      watchBodyVisibleForOop();
      return;
    }

    var delay = getBottomAnchorDelayMs();
    logAnchor("schedule display in " + delay + "ms", {
      width: w.innerWidth,
      height: w.innerHeight,
      earlyDefine: useEarlyDefineForTest(),
      defined: bottomAnchorDefined,
    });
    bottomAnchorTimer = w.setTimeout(function () {
      bottomAnchorTimer = null;
      runAnchorWhenReady();
    }, delay);
  }

  function watchBodyVisibleForOop() {
    if (bodyWatchStarted) {
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
    logAnchor("MutationObserver watching body");
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

  function watchAnchorViewport() {
    if (resizeWatchStarted) {
      return;
    }
    resizeWatchStarted = true;
    var timer = null;
    function onChange() {
      if (bottomAnchorDisplayed) {
        return;
      }
      if (timer) {
        w.clearTimeout(timer);
      }
      timer = w.setTimeout(function () {
        if (bottomAnchorDisplayed || !isBodyVisible()) {
          return;
        }
        if (!isAnchorViewportSupported()) {
          return;
        }
        logAnchor("viewport became eligible, retry");
        // 允许重新 define（之前可能因视口失败）
        if (!bottomAnchorDefined) {
          scheduleBottomAnchorDisplay();
        } else {
          displayBottomAnchor();
        }
      }, 300);
    }
    w.addEventListener("resize", onChange);
    w.addEventListener("orientationchange", onChange);
  }

  function watchDocumentVisibility() {
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState !== "visible" || bottomAnchorDisplayed) {
        return;
      }
      scheduleBottomAnchorDisplay();
    });
  }

  function initDeferredInterstitial() {
    if (!isBodyVisible() || !w.ApkAdLoader) {
      return Promise.resolve();
    }

    return w.ApkAdLoader
      .ensureGptSdk()
      .then(function () {
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

            defineOopSlot(
              "interstitial",
              w.ADX_OOP_DEFS.interstitial,
              oopConfig
            );
            if (w.ApkAdLoader.displayOopSlotByKey) {
              w.ApkAdLoader.displayOopSlotByKey("interstitial");
            }
            resolve();
          });
        });
      })
      .catch(function () {});
  }

  function notifyBodyVisible() {
    logAnchor("notifyBodyVisible");
    if (bottomAnchorTimer != null) {
      w.clearTimeout(bottomAnchorTimer);
      bottomAnchorTimer = null;
    }
    scheduleBottomAnchorDisplay();
    return initDeferredInterstitial();
  }

  function initOop() {
    if (!isAdxMode() || isAdFreePage()) {
      return;
    }
    if (!w.ApkAdLoader || !w.ADX_OOP_DEFS) {
      warnAnchor("ApkAdLoader or ADX_OOP_DEFS missing");
      return;
    }

    var defs = w.ADX_OOP_DEFS;
    var oopConfig = getOopConfig();
    var deferred =
      w.ApkAdLoader.isSraBatchDeferred && w.ApkAdLoader.isSraBatchDeferred();

    logAnchor("initOop", {
      local: isLocalHost(),
      demo: isDemoMode(),
      earlyDefine: useEarlyDefineForTest(),
      width: w.innerWidth,
      height: w.innerHeight,
      bodyVisible: isBodyVisible(),
    });

    w.ApkAdLoader.ensureGptSdk()
      .then(function () {
        w.googletag = w.googletag || { cmd: [] };
        w.googletag.cmd.push(function () {
          Object.keys(defs).forEach(function (key) {
            if (!shouldEnableOop(key, oopConfig)) {
              return;
            }
            if (key === "bottom_anchor") {
              // 本地/demo：提前 define（autoDisplay=false），body 可见后再 display
              // 生产：不在这里 define，等 body 可见后 define+display
              if (useEarlyDefineForTest()) {
                defineBottomAnchorNow(false);
              }
              return;
            }
            defineOopSlot(key, defs[key], oopConfig);
          });

          if (!deferred) {
            w.ApkAdLoader.ensureAdxServices();
          }

          scheduleBottomAnchorDisplay();
          watchBodyVisibleForOop();
          watchDocumentVisibility();
          watchAnchorViewport();
        });
        if (deferred) {
          w.ApkAdLoader.markOopDefined();
        }
      })
      .catch(function () {});
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
