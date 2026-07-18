(function (w) {
  /** 仅 ADX 模式使用；与 AdSense 完全分离，互不加载、互不调用。 */

  function isAdxMode() {
    return w.AD_CONFIG && w.AD_CONFIG.mode === "adx";
  }
  var sdkPromise = null;
  var gptLoadErrorLogged = false;
  var adxServicesEnabled = false;
  var definedAdxSlots = Object.create(null);
  var oopSlots = [];
  var slotListenerRegistered = false;
  var instanceSeq = 0;
  var sraBatchDeferred = false;
  var oopDefined = false;
  var oopReadyResolve = null;
  var oopReadyPromise = new Promise(function (resolve) {
    oopReadyResolve = resolve;
  });
  var MOBILE_MAX_AD_WIDTH = 300;
  var MOBILE_BREAKPOINT = "(max-width: 768px)";

  /** Google 官方 GPT 入门示例广告位 */
  var DEMO_AD_UNIT = "/6355419/Travel/Europe/France/Paris";
  var DEMO_SIZES = [[300, 250]];

  function isAdxTestMode() {
    var testMode = w.AD_CONFIG && w.AD_CONFIG.adx && w.AD_CONFIG.adx.testMode;
    return testMode === true || testMode === "demo";
  }

  function isLocalHost() {
    var host = w.location.hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  }

  function isMobileViewport() {
    if (w.matchMedia && w.matchMedia(MOBILE_BREAKPOINT).matches) {
      return true;
    }
    if (w.matchMedia && w.matchMedia("(pointer: coarse)").matches) {
      var narrow =
        w.innerWidth > 0
          ? w.innerWidth <= 768
          : w.screen && w.screen.width <= 768;
      if (narrow) {
        return true;
      }
    }
    return w.innerWidth > 0 && w.innerWidth <= 768;
  }

  /** 移动端仅请求宽度 ≤300 的固定尺寸，不请求 728×90，避免 iOS 越界 */
  function filterMobileSizes(sizes) {
    var pixel = [];
    sizes.forEach(function (s) {
      if (Array.isArray(s) && s.length === 2 && s[0] <= MOBILE_MAX_AD_WIDTH) {
        pixel.push(s);
      }
    });
    if (!pixel.length) {
      return [[300, 250]];
    }
    var seen = Object.create(null);
    return pixel.filter(function (s) {
      var key = s[0] + "x" + s[1];
      if (seen[key]) {
        return false;
      }
      seen[key] = true;
      return true;
    });
  }

  function shouldShowEmptyPlaceholder() {
    return isAdxTestMode() || isLocalHost();
  }

  function getAdxPath(slotKey) {
    var testMode = w.AD_CONFIG && w.AD_CONFIG.adx && w.AD_CONFIG.adx.testMode;
    if (testMode === "demo") {
      return DEMO_AD_UNIT;
    }

    var def = w.ADX_SLOT_DEFS && w.ADX_SLOT_DEFS[slotKey];
    if (!def || !def.unit) {
      return null;
    }
    var networkCode =
      (w.AD_CONFIG && w.AD_CONFIG.adx && w.AD_CONFIG.adx.networkCode) ||
      "23357265712";
    return "/" + networkCode + "/" + def.unit;
  }

  /** GPT defineSlot 可识别的固定像素尺寸列表（不含 fluid） */
  function normalizeGptSizes(sizes) {
    if (!sizes || !sizes.length) {
      return [[300, 250]];
    }

    var pixel = [];
    sizes.forEach(function (s) {
      if (Array.isArray(s) && s.length === 2) {
        pixel.push(s);
      }
    });

    if (!pixel.length) {
      return [[300, 250]];
    }
    return pixel;
  }

  function getAdxSizes(slotKey, def) {
    var testMode = w.AD_CONFIG && w.AD_CONFIG.adx && w.AD_CONFIG.adx.testMode;
    if (testMode === "demo") {
      return DEMO_SIZES;
    }
    var sizes = normalizeGptSizes((def && def.sizes) || [[300, 250]]);
    if (isMobileViewport()) {
      sizes = filterMobileSizes(sizes);
    }
    return sizes;
  }

  function isAdFreePage() {
    return (
      (w.AD_CONFIG && w.AD_CONFIG.adFree) ||
      (w.ApkAd && w.ApkAd.isAdFreePage && w.ApkAd.isAdFreePage())
    );
  }

  function displayOopSlots() {
    oopSlots.forEach(function (item) {
      if (item.autoDisplay === false || item.displayed) {
        return;
      }
      w.googletag.display(item.slot);
      item.displayed = true;
    });
  }

  function displayOopSlotByKey(slotKey) {
    for (var i = 0; i < oopSlots.length; i++) {
      var item = oopSlots[i];
      if (item.slotKey !== slotKey || item.displayed) {
        continue;
      }
      if (!adxServicesEnabled) {
        ensureAdxServices();
      }
      w.googletag.display(item.slot);
      item.displayed = true;
      return true;
    }
    return false;
  }

  function registerOopSlot(slotKey, slot, options) {
    if (!slot) {
      return;
    }
    var autoDisplay = !options || options.autoDisplay !== false;
    oopSlots.push({
      slotKey: slotKey,
      slot: slot,
      autoDisplay: autoDisplay,
      displayed: false,
    });
    if (adxServicesEnabled && autoDisplay) {
      w.googletag.display(slot);
      oopSlots[oopSlots.length - 1].displayed = true;
    }
  }

  function ensureAdxServices() {
    if (adxServicesEnabled) {
      return;
    }
    applyAdxPageConfig();
    registerSlotListener();
    w.googletag.enableServices();
    adxServicesEnabled = true;
    displayOopSlots();
  }

  function applyAdxPageConfig() {
    var pageConfig = {
      collapseDiv: shouldShowEmptyPlaceholder() ? "ON_NO_FILL" : "BEFORE_FETCH",
      singleRequest: true,
    };
    var adsenseAttrs = {};

    if (isAdxTestMode()) {
      adsenseAttrs.adsense_test_mode = "on";
    }

    if (isLocalHost()) {
      var origin =
        (w.AD_CONFIG.adx && w.AD_CONFIG.adx.productionOrigin) ||
        "https://identityinsight.org";
      adsenseAttrs.page_url = origin + w.location.pathname + w.location.search;
    }

    if (Object.keys(adsenseAttrs).length) {
      pageConfig.adsenseAttributes = adsenseAttrs;
    }

    if (w.googletag.setConfig) {
      w.googletag.setConfig(pageConfig);
    } else {
      w.googletag
        .pubads()
        .collapseEmptyDivs(!shouldShowEmptyPlaceholder());
      w.googletag.pubads().enableSingleRequest();
      if (adsenseAttrs.adsense_test_mode) {
        w.googletag.pubads().set("adsense_test_mode", "on");
      }
      if (adsenseAttrs.page_url) {
        w.googletag.pubads().set("page_url", adsenseAttrs.page_url);
      }
    }

    if (isAdxTestMode() && w.AD_CONFIG.adx.testMode === "demo") {
      console.info("[ApkAd] ADX demo：" + DEMO_AD_UNIT);
    } else if (isLocalHost()) {
      console.info("[ApkAd] 本地 ADX · page_url=" + adsenseAttrs.page_url);
    }
  }

  function isCardEmbedSlot(el) {
    return (
      el &&
      (el.id === "down_listAdv" ||
        el.id === "under_listAdv" ||
        el.classList.contains("most-box--ad"))
    );
  }

  function isAsideAdHost(el) {
    return (
      el &&
      (el.id === "aside_adv" || (el.closest && el.closest("#aside_adv")))
    );
  }

  function getAsideAdContainerWidth(node) {
    var aside =
      (node && node.closest && node.closest("#aside_adv")) ||
      document.getElementById("aside_adv");
    if (!aside) {
      return 300;
    }
    var width = aside.getBoundingClientRect().width || aside.offsetWidth;
    if (width > 0) {
      return Math.floor(width);
    }
    var sidebar = aside.closest(".detail-rightside, .detail-right");
    if (sidebar) {
      width = sidebar.getBoundingClientRect().width || sidebar.offsetWidth;
      if (width > 0) {
        return Math.floor(width);
      }
    }
    return 300;
  }

  function clampAsideAdNode(node) {
    if (!node || isMobileViewport()) {
      return;
    }
    var host = node.closest ? node.closest("#aside_adv") : null;
    if (!host) {
      return;
    }
    var containerW = getAsideAdContainerWidth(node);
    var maxW = containerW + "px";
    host.style.maxWidth = "100%";
    host.style.overflow = "hidden";
    host.style.boxSizing = "border-box";

    node.style.maxWidth = maxW;
    node.style.width = "100%";
    node.style.overflow = "hidden";
    node.style.boxSizing = "border-box";
    node.style.marginLeft = "auto";
    node.style.marginRight = "auto";

    node.querySelectorAll(
      "iframe, ins.adsbygoogle, div[id^='google_ads_iframe'], div[data-google-query-id]"
    ).forEach(function (el) {
      el.style.maxWidth = maxW;
      el.style.boxSizing = "border-box";
      el.style.overflow = "hidden";
      el.style.marginLeft = "auto";
      el.style.marginRight = "auto";
      if (el.tagName === "IFRAME") {
        scaleWideIframe(el, containerW);
      }
    });
  }

  function clampAsideAdFrame(divId) {
    if (isMobileViewport()) {
      return;
    }
    var node = document.getElementById(divId);
    if (!node) {
      return;
    }
    clampAsideAdNode(node);
  }

  function clampAllAsideAdHosts() {
    if (isMobileViewport()) {
      return;
    }
    document.querySelectorAll("#aside_adv").forEach(function (host) {
      host.style.maxWidth = "100%";
      host.style.overflow = "hidden";
      host.style.boxSizing = "border-box";
      var containerW = getAsideAdContainerWidth(host);
      host.querySelectorAll(
        "[id^='apk-ad-'], ins.adsbygoogle, iframe, div[id^='google_ads_iframe'], div[data-google-query-id]"
      ).forEach(function (el) {
        el.style.maxWidth = "100%";
        el.style.boxSizing = "border-box";
        el.style.overflow = "hidden";
        if (el.tagName === "IFRAME") {
          scaleWideIframe(el, containerW);
        }
      });
    });
  }

  function getAdDivInlineStyle(el) {
    if (isCardEmbedSlot(el)) {
      return (
        "width:100%;max-width:100%;height:100%;min-height:0;margin:0;" +
        "display:flex;align-items:center;justify-content:center;" +
        "box-sizing:border-box;overflow:hidden;"
      );
    }
    if (isMobileViewport()) {
      return (
        "width:100%;max-width:" +
        MOBILE_MAX_AD_WIDTH +
        "px;min-height:250px;text-align:center;" +
        "margin:8px auto;display:block;box-sizing:border-box;overflow:hidden;"
      );
    }
    return (
      "width:100%;max-width:100%;min-height:250px;text-align:center;" +
      "margin:8px auto;display:block;box-sizing:border-box;overflow:hidden;"
    );
  }

  function getMobileAdContainerWidth() {
    var vw =
      w.innerWidth ||
      (document.documentElement && document.documentElement.clientWidth) ||
      MOBILE_MAX_AD_WIDTH;
    return Math.max(240, Math.min(MOBILE_MAX_AD_WIDTH, vw - 32));
  }

  function getAllSlotSizes(def) {
    return normalizeGptSizes((def && def.sizes) || [[300, 250]]);
  }

  function getSlotSizesForViewport(slotKey, def) {
    var allSizes = getAllSlotSizes(def);
    if (!isMobileViewport()) {
      return {
        requestSizes: allSizes,
        useMapping: true,
      };
    }
    if (def && def.mobileSizes) {
      return {
        requestSizes: normalizeGptSizes(def.mobileSizes),
        useMapping: false,
      };
    }
    return {
      requestSizes: filterMobileSizes(allSizes),
      useMapping: false,
    };
  }

  function buildGptSizeMapping(def) {
    if (!w.googletag.sizeMapping) {
      return null;
    }
    var allSizes = getAllSlotSizes(def);
    var mobileSizes = filterMobileSizes(allSizes);
    return w
      .googletag.sizeMapping()
      .addSize([0, 0], mobileSizes)
      .addSize([769, 0], allSizes)
      .build();
  }

  function getIframeNaturalWidth(frame) {
    if (!frame) {
      return 0;
    }
    var attrW = parseInt(frame.getAttribute("width"), 10);
    if (attrW > 0) {
      return attrW;
    }
    var inlineW = parseInt(frame.style.width, 10);
    if (inlineW > 0) {
      return inlineW;
    }
    var rect = frame.getBoundingClientRect();
    if (rect.width > 0) {
      return rect.width;
    }
    return frame.offsetWidth || 0;
  }

  function scaleWideIframe(frame, containerW) {
    if (!frame) {
      return;
    }
    var frameW = getIframeNaturalWidth(frame);
    if (!frameW || frameW <= containerW + 2) {
      frame.style.transform = "";
      frame.style.width = "100%";
      frame.style.maxWidth = containerW + "px";
      if (frame.parentElement) {
        frame.parentElement.style.height = "";
        frame.parentElement.style.maxWidth = containerW + "px";
        frame.parentElement.style.overflow = "hidden";
      }
      return;
    }
    var scale = containerW / frameW;
    var frameH =
      frame.getBoundingClientRect().height ||
      parseInt(frame.getAttribute("height"), 10) ||
      250;
    frame.style.width = frameW + "px";
    frame.style.maxWidth = frameW + "px";
    frame.style.height = frameH + "px";
    frame.style.transform = "scale(" + scale + ")";
    frame.style.transformOrigin = "top center";
    frame.style.marginLeft = "auto";
    frame.style.marginRight = "auto";
    frame.style.display = "block";
    var parent = frame.parentElement;
    var host = frame.closest && frame.closest(".adswp, .apk-ad-clip, .state_advClass");
    var chain = [];
    while (parent && parent !== host && chain.length < 4) {
      chain.push(parent);
      parent = parent.parentElement;
    }
    chain.forEach(function (node) {
      node.style.maxWidth = containerW + "px";
      node.style.width = "100%";
      node.style.overflow = "hidden";
      node.style.marginLeft = "auto";
      node.style.marginRight = "auto";
      node.style.boxSizing = "border-box";
    });
    if (frame.parentElement) {
      frame.parentElement.style.width = containerW + "px";
      frame.parentElement.style.maxWidth = "100%";
      frame.parentElement.style.marginLeft = "auto";
      frame.parentElement.style.marginRight = "auto";
      frame.parentElement.style.overflow = "hidden";
      frame.parentElement.style.height = Math.ceil(frameH * scale) + "px";
    }
    if (host && isMobileViewport()) {
      host.style.maxWidth = containerW + "px";
      host.style.width = "100%";
      host.style.overflow = "hidden";
      host.style.marginLeft = "auto";
      host.style.marginRight = "auto";
    }
  }

  function clampMobileAdNode(node) {
    if (!node || isInsideGptOopAnchor(node)) {
      return;
    }
    var containerW = getMobileAdContainerWidth();
    var maxW = containerW + "px";
    node.style.maxWidth = maxW;
    node.style.width = maxW;
    node.style.marginLeft = "auto";
    node.style.marginRight = "auto";
    node.style.overflow = "hidden";
    node.style.boxSizing = "border-box";
    node.style.position = "relative";

    node.querySelectorAll(
      "iframe, div[id^='google_ads_iframe'], div[data-google-query-id]"
    ).forEach(function (el) {
      el.style.maxWidth = maxW;
      el.style.width = maxW;
      el.style.marginLeft = "auto";
      el.style.marginRight = "auto";
      el.style.display = "block";
      el.style.boxSizing = "border-box";
      el.style.overflow = "hidden";
      if (el.tagName === "IFRAME") {
        if (el.getAttribute("width") !== String(containerW)) {
          el.setAttribute("width", String(containerW));
        }
        el.setAttribute("scrolling", "no");
        scaleWideIframe(el, containerW);
      }
    });
  }

  function clampMobileAdFrame(divId) {
    if (!isMobileViewport()) {
      return;
    }
    var node = document.getElementById(divId);
    if (!node || isInsideGptOopAnchor(node)) {
      return;
    }
    clampMobileAdNode(node);
    var host = node.closest && node.closest(".adswp, .state_advClass, .divider-wrap");
    if (host) {
      var containerW = getMobileAdContainerWidth();
      host.style.maxWidth = containerW + "px";
      host.style.width = "100%";
      host.style.marginLeft = "auto";
      host.style.marginRight = "auto";
      host.style.overflow = "hidden";
      host.style.boxSizing = "border-box";
    }
  }

  var clampBusy = false;
  var clampDebounceTimer = null;
  var pendingClampIds = Object.create(null);
  var bodyObserverStarted = false;

  function isInsideGptOopAnchor(el) {
    if (!el || !el.closest) {
      return false;
    }
    return !!(
      el.closest("#google_bottom_anchor") ||
      el.closest("#google_top_anchor") ||
      el.closest("[data-anchor-status]")
    );
  }

  function applyMobileClampAll() {
    var containerW = getMobileAdContainerWidth();
    var hostMax = containerW + "px";
    document
      .querySelectorAll(
        ".adswp, .state_advClass, .divider-wrap.state_advClass, .apk-ad-clip"
      )
      .forEach(function (host) {
        if (isInsideGptOopAnchor(host)) {
          return;
        }
        host.style.maxWidth = hostMax;
        host.style.width = "100%";
        host.style.marginLeft = "auto";
        host.style.marginRight = "auto";
        host.style.overflow = "hidden";
        host.style.boxSizing = "border-box";
      });
    document
      .querySelectorAll(
        ".adswp div[id^='google_ads_iframe_'], .state_advClass div[id^='google_ads_iframe_'], .apk-ad-clip div[id^='google_ads_iframe_'], .adswp iframe, .state_advClass iframe, .apk-ad-clip iframe"
      )
      .forEach(function (el) {
        if (isInsideGptOopAnchor(el)) {
          return;
        }
        if (el.tagName === "IFRAME") {
          scaleWideIframe(el, containerW);
          return;
        }
        el.style.maxWidth = hostMax;
        el.style.width = hostMax;
        el.style.overflow = "hidden";
        el.style.marginLeft = "auto";
        el.style.marginRight = "auto";
      });
  }

  function scanAndClampAllMobileAds() {
    if (!isMobileViewport() || clampBusy) {
      return;
    }
    clampBusy = true;
    try {
      applyMobileClampAll();
    } finally {
      clampBusy = false;
    }
  }

  function flushMobileClampQueue() {
    clampDebounceTimer = null;
    if (!isMobileViewport() || clampBusy) {
      return;
    }
    var ids = Object.keys(pendingClampIds);
    var scanAll = pendingClampIds.__all;
    pendingClampIds = Object.create(null);
    if (!ids.length) {
      return;
    }
    clampBusy = true;
    try {
      ids.forEach(function (divId) {
        if (divId !== "__all") {
          clampMobileAdFrame(divId);
        }
      });
      if (scanAll) {
        applyMobileClampAll();
      }
    } finally {
      clampBusy = false;
    }
  }

  function queueMobileClamp(divId) {
    if (!isMobileViewport()) {
      return;
    }
    if (divId) {
      pendingClampIds[divId] = 1;
    } else {
      pendingClampIds.__all = 1;
    }
    if (clampDebounceTimer) {
      return;
    }
    clampDebounceTimer = w.setTimeout(flushMobileClampQueue, 180);
  }

  var mobileGuardStarted = false;
  function initMobileAdGuard() {
    if (!isMobileViewport() || mobileGuardStarted) {
      return;
    }
    mobileGuardStarted = true;
    ensureMobileAdStyles();
    queueMobileClamp();
    [400, 1200, 3000].forEach(function (ms) {
      w.setTimeout(function () {
        queueMobileClamp();
      }, ms);
    });
    if (bodyObserverStarted || typeof MutationObserver === "undefined" || !document.body) {
      return;
    }
    bodyObserverStarted = true;
    var bodyObserver = new MutationObserver(function (mutations) {
      var adChanged = false;
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type !== "childList") {
          continue;
        }
        var nodes = m.addedNodes;
        for (var j = 0; j < nodes.length; j++) {
          var n = nodes[j];
          if (n.nodeType !== 1) {
            continue;
          }
          // 锚定 OOP 由 GPT 自管，不要触发 banner 裁剪
          if (isInsideGptOopAnchor(n) || n.id === "google_bottom_anchor" || n.id === "google_top_anchor") {
            continue;
          }
          if (
            n.tagName === "IFRAME" ||
            (n.id && String(n.id).indexOf("google_ads_iframe") === 0) ||
            (n.querySelector && n.querySelector("iframe, [id^='google_ads_iframe_']"))
          ) {
            adChanged = true;
            break;
          }
        }
        if (adChanged) {
          break;
        }
      }
      if (adChanged) {
        queueMobileClamp();
      }
    });
    bodyObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
    if (document.body.style.display === "none") {
      var visibleObserver = new MutationObserver(function () {
        if (document.body.style.display !== "none") {
          [0, 400, 1200].forEach(function (ms) {
            w.setTimeout(function () {
              queueMobileClamp();
            }, ms);
          });
          visibleObserver.disconnect();
        }
      });
      visibleObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["style"],
      });
    }
  }

  function scheduleMobileClamp(divId) {
    queueMobileClamp(divId);
    w.setTimeout(function () {
      queueMobileClamp(divId);
    }, 600);
  }

  function observeAsideAdClamp(divId) {
    if (isMobileViewport()) {
      return;
    }
    var node = document.getElementById(divId);
    if (!node || !isAsideAdHost(node)) {
      return;
    }
    if (node.getAttribute("data-apk-ad-aside-clamp") === "1") {
      clampAsideAdFrame(divId);
      return;
    }
    node.setAttribute("data-apk-ad-aside-clamp", "1");
    clampAsideAdFrame(divId);
    w.setTimeout(function () {
      clampAsideAdFrame(divId);
    }, 600);
    if (typeof MutationObserver === "undefined") {
      return;
    }
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].addedNodes.length) {
          clampAsideAdFrame(divId);
          return;
        }
      }
    });
    observer.observe(node, {
      childList: true,
      subtree: true,
    });
  }

  function observeMobileAdClamp(divId) {
    if (!isMobileViewport()) {
      return;
    }
    var node = document.getElementById(divId);
    if (!node || node.getAttribute("data-apk-ad-clamp-obs") === "1") {
      return;
    }
    node.setAttribute("data-apk-ad-clamp-obs", "1");
    scheduleMobileClamp(divId);
    if (typeof MutationObserver === "undefined") {
      return;
    }
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].addedNodes.length) {
          queueMobileClamp(divId);
          return;
        }
      }
    });
    observer.observe(node, {
      childList: true,
      subtree: true,
    });
  }

  function ensureMobileAdStyles() {
    if (!isMobileViewport() || document.getElementById("apk-ad-mobile-css")) {
      return;
    }
    var link = document.createElement("link");
    link.id = "apk-ad-mobile-css";
    link.rel = "stylesheet";
    link.href = "/Public/Css/ad-mobile.css";
    document.head.appendChild(link);
  }

  function showEmptyPlaceholder(divId, path) {
    var node = document.getElementById(divId);
    if (!node) {
      return;
    }
    var cardEmbed = isCardEmbedSlot(node.parentElement);
    node.style.display = cardEmbed ? "flex" : "block";
    node.style.boxSizing = "border-box";
    node.style.color = "#666";
    node.style.lineHeight = "1.5";
    if (cardEmbed) {
      node.style.minHeight = "0";
      node.style.height = "100%";
      node.style.margin = "0";
      node.style.alignItems = "center";
      node.style.justifyContent = "center";
      node.style.flexDirection = "column";
      node.style.padding = "10px";
      node.style.border = "none";
      node.style.background = "#f8fafc";
      node.style.fontSize = "12px";
    } else {
      node.style.minHeight = "250px";
      node.style.border = "2px dashed #ccc";
      node.style.background = "#fafafa";
      node.style.fontSize = "13px";
      node.style.padding = "12px";
    }
    node.innerHTML =
      "<strong>广告位已加载，暂无填充</strong><br>" +
      (isLocalHost()
        ? "本地环境需 GAM 配置 Line Item；正式域名部署后才会稳定展示。<br>"
        : "请在 GAM 后台为该广告单元配置订单/广告项（Line Item）。<br>") +
      "<small style='color:#999'>" +
      path +
      "</small>";
  }

  function registerSlotListener() {
    if (slotListenerRegistered) {
      return;
    }
    slotListenerRegistered = true;

    w.googletag.pubads().addEventListener("slotRenderEnded", function (event) {
      var divId = event.slot.getSlotElementId();
      if (!event.isEmpty) {
        if (isMobileViewport()) {
          clampMobileAdFrame(divId);
        }
        scheduleMobileClamp(divId);
        observeMobileAdClamp(divId);
        observeAsideAdClamp(divId);
        if (w.location.search.indexOf("addebug=1") >= 0) {
          console.info("[ApkAd] filled", divId, event.size);
        }
        return;
      }
      if (!shouldShowEmptyPlaceholder()) {
        return;
      }
      showEmptyPlaceholder(divId, event.slot.getAdUnitPath());
    });

    w.googletag.pubads().addEventListener("impressionViewable", function (event) {
      if (!isMobileViewport()) {
        return;
      }
      scheduleMobileClamp(event.slot.getSlotElementId());
    });

    w.googletag.pubads().addEventListener("slotRequested", function (event) {
      var divId = event.slot.getSlotElementId();
      var node = document.getElementById(divId);
      if (node) {
        node.setAttribute("data-apk-ad-requested", "1");
      }
    });
  }

  function getAdxDivId(slotKey) {
    return "apk-ad-" + slotKey.replace(/[^a-zA-Z0-9_-]/g, "-");
  }

  /** 同一 slotKey 在页内可出现多次（懒加载），每次需要唯一 div id。
   *  涉及：state_adv3、city_adv3、district_adv3、list_adv4 等列表内重复插入的广告位。 */
  function resolveInstanceDivId(slotKey, el) {
    var attr = "data-apk-ad-div-id";
    var existing = el.getAttribute(attr);
    if (existing) {
      return existing;
    }
    var divId = getAdxDivId(slotKey) + "-" + ++instanceSeq;
    el.setAttribute(attr, divId);
    return divId;
  }

  function getGptSdkUrl() {
    if (w.ApkAd && w.ApkAd.getGptSdkUrl) {
      return w.ApkAd.getGptSdkUrl();
    }
    return "https://securepubads.g.doubleclick.net/tag/js/gpt.js";
  }

  function getGptSdkUrls() {
    if (w.ApkAd && w.ApkAd.getGptSdkUrls) {
      return w.ApkAd.getGptSdkUrls();
    }
    return [getGptSdkUrl()];
  }

  function logGptLoadError(err) {
    if (gptLoadErrorLogged) {
      return;
    }
    gptLoadErrorLogged = true;
    console.error("[ApkAd] GPT load failed:", err);
    console.warn(
      "[ApkAd] 无法加载 Google Publisher Tag（已尝试 securepubads 与 googletagservices）。" +
        "常见原因：VPN 未代理 doubleclick.net、广告拦截、浏览器跟踪防护。" +
        "可单独测试：https://www.googletagservices.com/tag/js/gpt.js"
    );
  }

  function loadScript(src, id, retryCount) {
    retryCount = retryCount || 0;

    return new Promise(function (resolve, reject) {
      function attachListeners(script) {
        if (script.getAttribute("data-loaded") === "1") {
          resolve();
          return;
        }
        if (script.getAttribute("data-failed") === "1") {
          if (retryCount < 1) {
            script.remove();
            loadScript(src, id, retryCount + 1).then(resolve, reject);
            return;
          }
          reject(new Error("Script failed to load: " + src));
          return;
        }
        script.addEventListener(
          "load",
          function () {
            script.setAttribute("data-loaded", "1");
            resolve();
          },
          { once: true }
        );
        script.addEventListener(
          "error",
          function (ev) {
            script.setAttribute("data-failed", "1");
            reject(ev || new Error("Script failed to load: " + src));
          },
          { once: true }
        );
      }

      var script = null;
      if (id) {
        script = document.getElementById(id);
      }
      if (!script) {
        script = document.querySelector('script[src="' + src + '"]');
      }
      if (script) {
        attachListeners(script);
        return;
      }

      script = document.createElement("script");
      script.async = true;
      script.crossOrigin = "anonymous";
      script.src = src;
      if (id) {
        script.id = id;
      }
      script.onload = function () {
        script.setAttribute("data-loaded", "1");
        resolve();
      };
      script.onerror = function (ev) {
        script.setAttribute("data-failed", "1");
        reject(ev || new Error("Script failed to load: " + src));
      };
      document.head.appendChild(script);
    });
  }

  function loadGptSdkWithFallback(urls, id, index) {
    index = index || 0;
    if (index >= urls.length) {
      return Promise.reject(new Error("All GPT SDK URLs failed"));
    }
    var src = urls[index];
    var existing = document.getElementById(id);
    if (existing && existing.src !== src) {
      existing.remove();
    }
    return loadScript(src, id, 0).catch(function (err) {
      if (index + 1 < urls.length) {
        console.warn(
          "[ApkAd] GPT CDN 不可用 (" + src + ")，尝试备用：" + urls[index + 1]
        );
        var failed = document.getElementById(id);
        if (failed) {
          failed.remove();
        }
        return loadGptSdkWithFallback(urls, id, index + 1);
      }
      throw err;
    });
  }

  function ensureGptSdk() {
    if (sdkPromise) {
      return sdkPromise;
    }
    w.googletag = w.googletag || { cmd: [] };
    sdkPromise = loadGptSdkWithFallback(getGptSdkUrls(), "apk-adx-sdk").catch(
      function (err) {
        logGptLoadError(err);
        return Promise.reject(err);
      }
    );
    return sdkPromise;
  }

  function deferSraBatch() {
    sraBatchDeferred = true;
  }

  function isSraBatchDeferred() {
    return sraBatchDeferred;
  }

  function markOopDefined() {
    oopDefined = true;
    if (oopReadyResolve) {
      oopReadyResolve();
      oopReadyResolve = null;
    }
  }

  function whenOopReady() {
    if (oopDefined || !sraBatchDeferred) {
      return Promise.resolve();
    }
    return oopReadyPromise;
  }

  function commitSraBatch() {
    w.googletag = w.googletag || { cmd: [] };
    w.googletag.cmd.push(function () {
      ensureAdxServices();
    });
  }

  function clampMobileAdHost(el) {
    if (!el || !isMobileViewport() || isCardEmbedSlot(el)) {
      return;
    }
    var containerW = getMobileAdContainerWidth();
    var maxPx = containerW + "px";
    el.style.maxWidth = maxPx;
    el.style.width = "100%";
    el.style.marginLeft = "auto";
    el.style.marginRight = "auto";
    el.style.overflow = "hidden";
    el.style.boxSizing = "border-box";
    el.style.position = "relative";
  }

  function mountAdSlotDom(slotKey, el) {
    var def = w.ADX_SLOT_DEFS[slotKey];
    var divId = resolveInstanceDivId(slotKey, el);
    var slotStyle = getAdDivInlineStyle(el);
    var clipHtml = "";

    clampMobileAdHost(el);

    if (isMobileViewport() && !isCardEmbedSlot(el)) {
      var clipW = getMobileAdContainerWidth();
      clipHtml =
        '<div class="apk-ad-clip" style="width:' +
        clipW +
        "px;max-width:100%;margin:0 auto;overflow:hidden;position:relative;box-sizing:border-box\">";
    }

    el.innerHTML =
      clipHtml +
      '<div id="' +
      divId +
      '" style="' +
      slotStyle +
      '"></div>' +
      (clipHtml ? "</div>" : "");

    return divId;
  }

  function defineGptSlot(slotKey, divId, def) {
    var path = getAdxPath(slotKey);
    if (!path) {
      return null;
    }

    var sizePlan = getSlotSizesForViewport(slotKey, def);
    var slot = w.googletag.defineSlot(path, sizePlan.requestSizes, divId);
    if (slot && sizePlan.useMapping) {
      var mapping = buildGptSizeMapping(def);
      if (mapping) {
        slot = slot.defineSizeMapping(mapping);
      }
    }
    if (slot) {
      slot = slot.addService(w.googletag.pubads());
    }
    if (slot) {
      definedAdxSlots[divId] = slot;
    }
    return slot;
  }

  function markAdElementDisplayed(el, divId) {
    w.googletag.display(divId);
    observeMobileAdClamp(divId);
    observeAsideAdClamp(divId);
    el.setAttribute("data-apk-ad-loaded", "1");
    el.removeAttribute("data-apk-ad-pending");
  }

  function defineAdxSlot(slotKey, el) {
    if (!el || !isAdxMode() || isAdFreePage()) {
      return Promise.resolve(null);
    }

    var path = getAdxPath(slotKey);
    if (!path) {
      console.warn("[ApkAd] ADX slot not configured:", slotKey);
      return Promise.resolve(null);
    }

    ensureMobileAdStyles();

    if (el.getAttribute("data-apk-ad-loaded") === "1") {
      return Promise.resolve(el.getAttribute("data-apk-ad-div-id"));
    }

    if (el.getAttribute("data-apk-ad-pending") === "1") {
      return Promise.resolve(el.getAttribute("data-apk-ad-div-id"));
    }
    el.setAttribute("data-apk-ad-pending", "1");

    var def = w.ADX_SLOT_DEFS[slotKey];
    var divId = mountAdSlotDom(slotKey, el);

    return ensureGptSdk().then(function () {
      return new Promise(function (resolve) {
        w.googletag = w.googletag || { cmd: [] };
        w.googletag.cmd.push(function () {
          if (!definedAdxSlots[divId]) {
            var slot = defineGptSlot(slotKey, divId, def);
            if (!slot) {
              console.warn(
                "[ApkAd] defineSlot 失败:",
                slotKey,
                path,
                getAllSlotSizes(def)
              );
              el.removeAttribute("data-apk-ad-pending");
              if (shouldShowEmptyPlaceholder()) {
                showEmptyPlaceholder(divId, path);
              }
              resolve(null);
              return;
            }
          }
          resolve(divId);
        });
      });
    });
  }

  function displayAdxElement(el) {
    if (!el || el.getAttribute("data-apk-ad-loaded") === "1") {
      return;
    }

    var divId = el.getAttribute("data-apk-ad-div-id");
    if (!divId || !definedAdxSlots[divId]) {
      return;
    }

    w.googletag = w.googletag || { cmd: [] };
    w.googletag.cmd.push(function () {
      if (!definedAdxSlots[divId]) {
        return;
      }
      markAdElementDisplayed(el, divId);
    });
  }

  function renderAdx(slotKey, el) {
    var path = getAdxPath(slotKey);
    if (!path) {
      console.warn("[ApkAd] ADX slot not configured:", slotKey);
      return;
    }

    ensureMobileAdStyles();

    if (el.getAttribute("data-apk-ad-loaded") === "1") {
      return;
    }

    var existingDivId = el.getAttribute("data-apk-ad-div-id");
    if (existingDivId && definedAdxSlots[existingDivId]) {
      w.googletag = w.googletag || { cmd: [] };
      w.googletag.cmd.push(function () {
        if (!definedAdxSlots[existingDivId]) {
          return;
        }
        if (!adxServicesEnabled) {
          ensureAdxServices();
        }
        markAdElementDisplayed(el, existingDivId);
      });
      return;
    }

    if (el.getAttribute("data-apk-ad-pending") === "1") {
      return;
    }
    el.setAttribute("data-apk-ad-pending", "1");

    var def = w.ADX_SLOT_DEFS[slotKey];
    var divId = mountAdSlotDom(slotKey, el);
    var allSizes = getAllSlotSizes(def);

    w.googletag = w.googletag || { cmd: [] };
    w.googletag.cmd.push(function () {
      var slot = definedAdxSlots[divId];
      if (!slot) {
        slot = defineGptSlot(slotKey, divId, def);
        if (!slot) {
          console.warn(
            "[ApkAd] defineSlot 失败:",
            slotKey,
            path,
            allSizes
          );
          el.removeAttribute("data-apk-ad-pending");
          if (shouldShowEmptyPlaceholder()) {
            showEmptyPlaceholder(divId, path);
          }
          return;
        }
      }

      if (!adxServicesEnabled) {
        ensureAdxServices();
      }

      markAdElementDisplayed(el, divId);
    });
  }

  function render(slotKey, el) {
    if (!el || !isAdxMode() || isAdFreePage()) {
      return;
    }

    if (el.getAttribute("data-apk-ad-loaded") === "1") {
      return;
    }

    ensureGptSdk().then(function () {
      renderAdx(slotKey, el);
    });
  }

  var asideGuardStarted = false;
  function initAsideAdGuard() {
    if (isMobileViewport() || asideGuardStarted) {
      return;
    }
    asideGuardStarted = true;
    clampAllAsideAdHosts();
    [400, 1200, 3000].forEach(function (ms) {
      w.setTimeout(clampAllAsideAdHosts, ms);
    });
    if (typeof MutationObserver === "undefined" || !document.body) {
      return;
    }
    var asideObserver = new MutationObserver(function (mutations) {
      var asideChanged = false;
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type !== "childList") {
          continue;
        }
        var nodes = m.addedNodes;
        for (var j = 0; j < nodes.length; j++) {
          var n = nodes[j];
          if (n.nodeType !== 1) {
            continue;
          }
          if (
            n.id === "aside_adv" ||
            (n.querySelector && n.querySelector("#aside_adv, iframe, [id^='google_ads_iframe_']"))
          ) {
            asideChanged = true;
            break;
          }
        }
        if (asideChanged) {
          break;
        }
      }
      if (asideChanged) {
        clampAllAsideAdHosts();
      }
    });
    asideObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  w.ApkAdLoader = {
    render: render,
    ensureGptSdk: ensureGptSdk,
    ensureAdxServices: ensureAdxServices,
    registerOopSlot: registerOopSlot,
    displayOopSlotByKey: displayOopSlotByKey,
    deferSraBatch: deferSraBatch,
    isSraBatchDeferred: isSraBatchDeferred,
    markOopDefined: markOopDefined,
    whenOopReady: whenOopReady,
    defineAdxSlot: defineAdxSlot,
    displayAdxElement: displayAdxElement,
    commitSraBatch: commitSraBatch,
    scanAndClampAllMobileAds: scanAndClampAllMobileAds,
    clampAllAsideAdHosts: clampAllAsideAdHosts,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      initMobileAdGuard();
      initAsideAdGuard();
    });
  } else {
    initMobileAdGuard();
    initAsideAdGuard();
  }

  if (w.visualViewport) {
    var viewportTimer = null;
    w.visualViewport.addEventListener("resize", function () {
      if (!isMobileViewport()) {
        return;
      }
      if (viewportTimer) {
        w.clearTimeout(viewportTimer);
      }
      viewportTimer = w.setTimeout(function () {
        viewportTimer = null;
        queueMobileClamp();
      }, 200);
    });
  }
})(window);
