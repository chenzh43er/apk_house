/**
 * ADX Out-of-Page：移动端顶部锚定（TOP_ANCHOR）+ Web 穿插广告。
 *
 * 锚定可见率：
 * - 生产环境：body 可见后才 define（避免 SRA 在 display:none 时一并请求）
 * - 本地 / adtest=demo：可提前 define、body 可见后再 display（方便验证）
 *
 * GPT 限制：TOP_ANCHOR 仅在顶层窗口 + 竖屏 + 宽度约 320–1000px 时
 * defineOutOfPageSlot 才会成功；宽屏 PC 仍走 desktop 底部 sticky banner 兜底。
 */
(function (w) {
  var DEMO_AD_UNIT = "/6355419/Travel";
  var DESKTOP_STICKY_SLOT = "desktop_bottom_sticky";
  var bottomAnchorDefined = false;
  var bottomAnchorDefining = false;
  var bottomAnchorDisplayed = false;
  var desktopStickyShown = false;
  var bottomAnchorTimer = null;
  var bodyWatchStarted = false;
  var resizeWatchStarted = false;
  var anchorFixing = false;

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
    // bottomAnchor 开关控制移动端 GPT 锚定（现为 TOP_ANCHOR）
    if (key === "top_anchor" && oopConfig.bottomAnchor === false) {
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

  function getAnchorTestTip() {
    var base =
      w.location.origin +
      w.location.pathname +
      "?adtest=demo#gamTopAnchorDemo";
    return (
      "GPT 官方 TOP_ANCHOR 仅：顶层 + 竖屏 + 宽 320–1000px。" +
      "宽屏 PC 会自动用底部 sticky banner 兜底。" +
      "测官方 OOP：DevTools 设备模式后刷新，或：" +
      base
    );
  }

  function shouldUseDesktopStickyFallback() {
    var oopConfig = getOopConfig();
    if (oopConfig.bottomAnchor === false) {
      return false;
    }
    if (oopConfig.bottomAnchorDesktopFallback === false) {
      return false;
    }
    if (bottomAnchorDisplayed || desktopStickyShown) {
      return false;
    }
    // 仅宽屏 PC：窄屏留给 GPT OOP（含横屏手机也不挂 sticky，避免叠两层）
    return !isAnchorViewportSupported() && (w.innerWidth || 0) > 1000;
  }

  function destroyDesktopSticky() {
    var host = document.getElementById("apk-desktop-bottom-sticky");
    if (host && host.parentNode) {
      host.parentNode.removeChild(host);
    }
    if (document.documentElement) {
      document.documentElement.classList.remove("apk-has-desktop-sticky");
    }
    desktopStickyShown = false;
  }

  function tryDesktopBottomSticky() {
    if (!shouldUseDesktopStickyFallback()) {
      return false;
    }
    if (!isBodyVisible() || !w.ApkAdLoader || !w.ApkAdLoader.render) {
      return false;
    }
    if (!w.ADX_SLOT_DEFS || !w.ADX_SLOT_DEFS[DESKTOP_STICKY_SLOT]) {
      warnAnchor("desktop_bottom_sticky slot missing in ADX_SLOT_DEFS");
      return false;
    }

    destroyDesktopSticky();

    var host = document.createElement("div");
    host.id = "apk-desktop-bottom-sticky";
    host.className = "apk-desktop-bottom-sticky";
    host.setAttribute("role", "complementary");
    host.setAttribute("aria-label", "Advertisement");

    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "apk-desktop-bottom-sticky__close";
    closeBtn.setAttribute("aria-label", "Close ad");
    closeBtn.innerHTML = "&times;";
    closeBtn.addEventListener("click", function () {
      destroyDesktopSticky();
    });

    var adHost = document.createElement("div");
    adHost.id = "apk-desktop-bottom-sticky-ad";
    adHost.className = "apk-desktop-bottom-sticky__ad";

    host.appendChild(closeBtn);
    host.appendChild(adHost);
    document.body.appendChild(host);
    if (document.documentElement) {
      document.documentElement.classList.add("apk-has-desktop-sticky");
    }

    desktopStickyShown = true;
    w.ApkAdLoader.render(DESKTOP_STICKY_SLOT, adHost);
    suppressForeignBottomAnchors(host);
    logAnchor("desktop sticky fallback displayed", {
      width: w.innerWidth,
      height: w.innerHeight,
      slot: DESKTOP_STICKY_SLOT,
    });
    watchAnchorViewport();
    return true;
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
          tip: getAnchorTestTip(),
        }
      );
      return null;
    }

    // Google 官方 Travel demo 锚定需 test=anchor 才会出创意
    if (
      isDemoMode() &&
      (def.format === "TOP_ANCHOR" || def.format === "BOTTOM_ANCHOR") &&
      typeof slot.setTargeting === "function"
    ) {
      slot.setTargeting("test", "anchor");
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

  /** 若锚定被挤进文档流，强制拉回视口顶部（不改内部创意布局） */
  function ensureBottomAnchorFixed() {
    if (anchorFixing) {
      return false;
    }
    // GPT 新旧 DOM：#google_top_anchor 或 ins#gpt_unit_*[data-anchor-status]
    var root =
      document.getElementById("google_top_anchor") ||
      document.querySelector(
        'ins[data-anchor-status][data-anchor-shown="true"]'
      ) ||
      document.querySelector("ins[id^='gpt_unit_'][data-anchor-status]");
    if (!root) {
      var units = document.querySelectorAll("ins[id^='gpt_unit_']");
      for (var i = 0; i < units.length; i++) {
        var el = units[i];
        var cs = w.getComputedStyle ? w.getComputedStyle(el) : null;
        if (cs && cs.position === "fixed" && (cs.top === "0px" || cs.top === "0")) {
          root = el;
          break;
        }
      }
    }
    if (!root) {
      return false;
    }
    anchorFixing = true;
    try {
      // 清掉移动端 banner 裁剪可能写上的限制
      root.style.removeProperty("max-width");
      root.style.removeProperty("width");
      root.style.removeProperty("position");
      root.style.setProperty("position", "fixed", "important");
      root.style.setProperty("top", "0", "important");
      root.style.setProperty("bottom", "auto", "important");
      root.style.setProperty("left", "0", "important");
      root.style.setProperty("right", "0", "important");
      root.style.setProperty("width", "100%", "important");
      root.style.setProperty("max-width", "none", "important");
      root.style.setProperty("z-index", "2147483646", "important");
      root.style.setProperty("margin", "0", "important");
      root.style.setProperty("overflow", "visible", "important");
      // 若误挂到 html 等非 body 节点，挪回 body，避免被 overflow 祖先裁切
      if (document.body && root.parentNode !== document.body) {
        document.body.appendChild(root);
      }
      // 让 sticky 顶栏躲到锚定下方，避免被盖住
      var h = root.offsetHeight || 0;
      if (document.documentElement) {
        document.documentElement.classList.add("apk-has-top-anchor");
        if (h > 0) {
          document.documentElement.style.setProperty(
            "--apk-top-anchor-h",
            h + "px"
          );
        }
      }
      suppressForeignBottomAnchors(root);
      return true;
    } finally {
      anchorFixing = false;
    }
  }

  /**
   * 隐藏非 GPT 的底部锚定（常见：AdSense Auto ads），避免 PC/手机叠两层。
   * 保留顶部锚定（#google_top_anchor / ins#gpt_unit_*）与我们的 desktop sticky。
   */
  function suppressForeignBottomAnchors(keepRoot) {
    var keep =
      keepRoot ||
      document.getElementById("google_top_anchor") ||
      document.querySelector("ins[id^='gpt_unit_'][data-anchor-status]") ||
      document.getElementById("google_bottom_anchor");
    var nodes = document.querySelectorAll(
      ".google-auto-placed, ins.adsbygoogle, [id^='google_ads_iframe_']"
    );
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el || (keep && (el === keep || (keep.contains && keep.contains(el))))) {
        continue;
      }
      if (el.closest && el.closest("#apk-desktop-bottom-sticky")) {
        continue;
      }
      if (
        el.closest &&
        el.closest(
          "#google_bottom_anchor, #google_top_anchor, ins[id^='gpt_unit_'][data-anchor-status]"
        )
      ) {
        continue;
      }
      var cs = w.getComputedStyle(el);
      if (cs.position !== "fixed" && cs.position !== "sticky") {
        // 再看父级是否 fixed 贴底
        var p = el.parentElement;
        var parentFixed = false;
        while (p && p !== document.body) {
          var pcs = w.getComputedStyle(p);
          if (pcs.position === "fixed") {
            var bottom = pcs.bottom;
            if (bottom === "0px" || bottom === "0") {
              parentFixed = true;
              el = p;
              cs = pcs;
              break;
            }
          }
          p = p.parentElement;
        }
        if (!parentFixed) {
          continue;
        }
      }
      var bottom = cs.bottom;
      var top = cs.top;
      var nearBottom =
        bottom === "0px" ||
        bottom === "0" ||
        (parseInt(bottom, 10) >= 0 && parseInt(bottom, 10) < 80);
      var notTopAnchor = top === "auto" || top === "" || parseInt(top, 10) > 100;
      if (!nearBottom || !notTopAnchor) {
        continue;
      }
      // 疑似第二套底部锚定
      if (
        el.id === "google_bottom_anchor" ||
        el.id === "google_top_anchor" ||
        el.id === "apk-desktop-bottom-sticky" ||
        (el.id && String(el.id).indexOf("gpt_unit_") === 0)
      ) {
        continue;
      }
      el.style.setProperty("display", "none", "important");
      el.setAttribute("data-apk-suppressed-anchor", "1");
    }
  }

  var anchorFixedWatchStarted = false;
  function watchAndFixBottomAnchor() {
    ensureBottomAnchorFixed();
    [100, 400, 1000, 2000, 4000].forEach(function (ms) {
      w.setTimeout(ensureBottomAnchorFixed, ms);
    });
    if (anchorFixedWatchStarted || typeof MutationObserver === "undefined") {
      return;
    }
    anchorFixedWatchStarted = true;
    var obs = new MutationObserver(function () {
      if (anchorFixing) {
        return;
      }
      ensureBottomAnchorFixed();
    });
    function attach() {
      var root =
        document.getElementById("google_top_anchor") ||
        document.querySelector(
          'ins[data-anchor-status][data-anchor-shown="true"]'
        ) ||
        document.querySelector("ins[id^='gpt_unit_'][data-anchor-status]") ||
        document.querySelector("ins[id^='gpt_unit_']");
      if (!root) {
        return false;
      }
      obs.observe(root, {
        attributes: true,
        attributeFilter: ["class", "data-anchor-status", "data-anchor-shown"],
      });
      if (document.body) {
        obs.observe(document.body, { childList: true, subtree: false });
      }
      // GPT 常把锚定挂到 <html> 下，body 观察不到
      if (document.documentElement) {
        obs.observe(document.documentElement, { childList: true });
      }
      ensureBottomAnchorFixed();
      return true;
    }
    if (!attach()) {
      var bodyObs = new MutationObserver(function () {
        if (attach()) {
          bodyObs.disconnect();
        }
      });
      if (document.documentElement) {
        bodyObs.observe(document.documentElement, {
          childList: true,
          subtree: true,
        });
      } else if (document.body) {
        bodyObs.observe(document.body, { childList: true, subtree: true });
      }
    }
  }

  function displayBottomAnchor() {
    if (bottomAnchorDisplayed || desktopStickyShown || !w.ApkAdLoader) {
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
      w.ApkAdLoader.displayOopSlotByKey("top_anchor")
    ) {
      bottomAnchorDisplayed = true;
      destroyDesktopSticky();
      watchAndFixBottomAnchor();
      logAnchor("displayed (TOP_ANCHOR)");
      return true;
    }
    return false;
  }

  function defineBottomAnchorNow(autoDisplay) {
    if (
      bottomAnchorDefined ||
      bottomAnchorDefining ||
      !w.ApkAdLoader ||
      !w.ADX_OOP_DEFS
    ) {
      return false;
    }
    var oopConfig = getOopConfig();
    if (!shouldEnableOop("top_anchor", oopConfig)) {
      return false;
    }
    var def = w.ADX_OOP_DEFS.top_anchor;
    if (!def) {
      return false;
    }

    if (!isAnchorViewportSupported()) {
      logAnchor("GPT OOP ineligible → try desktop sticky", {
        width: w.innerWidth,
        height: w.innerHeight,
      });
      tryDesktopBottomSticky();
      watchAnchorViewport();
      armLocalAnchorRetries();
      return false;
    }

    bottomAnchorDefining = true;
    var slot = defineOopSlot("top_anchor", def, oopConfig, {
      autoDisplay: autoDisplay === true,
    });
    bottomAnchorDefining = false;
    if (!slot) {
      tryDesktopBottomSticky();
      watchAnchorViewport();
      return false;
    }

    bottomAnchorDefined = true;
    destroyDesktopSticky();
    if (autoDisplay === true) {
      bottomAnchorDisplayed = true;
      watchAndFixBottomAnchor();
    }
    logAnchor("defined (TOP_ANCHOR)", {
      autoDisplay: !!autoDisplay,
      path: getOopPath(def),
    });
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

      if (desktopStickyShown && !isAnchorViewportSupported()) {
        return;
      }

      if (!bottomAnchorDefined) {
        if (!defineBottomAnchorNow(false)) {
          tryDesktopBottomSticky();
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
    if (bottomAnchorDisplayed || desktopStickyShown) {
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
      viewportOk: isAnchorViewportSupported(),
      desktopFallback: shouldUseDesktopStickyFallback(),
    });
    if (delay <= 0) {
      runAnchorWhenReady();
      armLocalAnchorRetries();
      return;
    }
    bottomAnchorTimer = w.setTimeout(function () {
      bottomAnchorTimer = null;
      runAnchorWhenReady();
      armLocalAnchorRetries();
    }, delay);
  }

  /** DevTools 设备模式常在首屏之后才稳定 innerWidth，本地补几次重试 */
  var localRetryArmed = false;
  function armLocalAnchorRetries() {
    if (localRetryArmed || bottomAnchorDisplayed) {
      return;
    }
    if (!isLocalHost() && !isDemoMode()) {
      return;
    }
    localRetryArmed = true;
    [400, 1200, 2500].forEach(function (ms) {
      w.setTimeout(function () {
        if (bottomAnchorDisplayed || !isBodyVisible()) {
          return;
        }
        if (!isAnchorViewportSupported()) {
          if (!desktopStickyShown) {
            tryDesktopBottomSticky();
          }
          return;
        }
        logAnchor("local retry @" + ms + "ms");
        if (desktopStickyShown) {
          destroyDesktopSticky();
        }
        if (!bottomAnchorDefined) {
          defineBottomAnchorNow(false);
        }
        displayBottomAnchor();
      }, ms);
    });
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
          if (!desktopStickyShown) {
            tryDesktopBottomSticky();
          }
          return;
        }
        logAnchor("viewport became eligible, retry OOP anchor");
        if (desktopStickyShown) {
          destroyDesktopSticky();
        }
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
      if (
        document.visibilityState !== "visible" ||
        bottomAnchorDisplayed ||
        desktopStickyShown
      ) {
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
            if (key === "top_anchor") {
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
    ensureBottomAnchorFixed: ensureBottomAnchorFixed,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initOop);
  } else {
    initOop();
  }
})(window);
