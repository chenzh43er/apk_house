(function (w) {
  /** 仅 ADX 模式使用；与 AdSense 完全分离，互不加载、互不调用。 */

  function isAdxMode() {
    return w.AD_CONFIG && w.AD_CONFIG.mode === "adx";
  }
  var sdkPromise = null;
  var adxServicesEnabled = false;
  var definedAdxSlots = Object.create(null);
  var oopSlots = [];
  var slotListenerRegistered = false;
  var instanceSeq = 0;
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
    if (w.innerWidth > 0 && w.innerWidth <= 768) {
      return true;
    }
    return w.matchMedia && w.matchMedia(MOBILE_BREAKPOINT).matches;
  }

  /** 移动端仅请求宽度 ≤300 的固定尺寸，不请求 fluid / 728×90，避免 iOS 越界 */
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

  /** GPT defineSlot 可识别的尺寸列表 */
  function normalizeGptSizes(sizes) {
    if (!sizes || !sizes.length) {
      return [[300, 250]];
    }

    var pixel = [];
    var hasFluid = false;

    sizes.forEach(function (s) {
      if (s === "fluid") {
        hasFluid = true;
      } else if (Array.isArray(s) && s.length === 2) {
        pixel.push(s);
      }
    });

    if (!pixel.length && !hasFluid) {
      return [[300, 250]];
    }
    if (hasFluid) {
      return pixel.length ? pixel.concat(["fluid"]) : ["fluid"];
    }
    return pixel;
  }

  function getAdxSizes(slotKey, def) {
    var testMode = w.AD_CONFIG && w.AD_CONFIG.adx && w.AD_CONFIG.adx.testMode;
    if (testMode === "demo") {
      return DEMO_SIZES;
    }
    var sizes = normalizeGptSizes((def && def.sizes) || ["fluid"]);
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
      w.googletag.display(item.slot);
    });
  }

  function registerOopSlot(slotKey, slot) {
    if (!slot) {
      return;
    }
    oopSlots.push({ slotKey: slotKey, slot: slot });
    if (adxServicesEnabled) {
      w.googletag.display(slot);
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
      "margin:8px auto;display:block;box-sizing:border-box;"
    );
  }

  function clampMobileAdNode(node) {
    if (!node) {
      return;
    }
    var maxW = MOBILE_MAX_AD_WIDTH + "px";
    var maxVw = "min(" + MOBILE_MAX_AD_WIDTH + "px, 100vw)";
    node.style.maxWidth = maxW;
    node.style.width = "100%";
    node.style.marginLeft = "auto";
    node.style.marginRight = "auto";
    node.style.overflow = "hidden";
    node.style.boxSizing = "border-box";

    node.querySelectorAll(
      "iframe, div[id^='google_ads_iframe'], div[data-google-query-id]"
    ).forEach(function (el) {
      el.style.maxWidth = maxVw;
      el.style.width = "100%";
      el.style.marginLeft = "auto";
      el.style.marginRight = "auto";
      el.style.display = "block";
      el.style.boxSizing = "border-box";
      el.style.overflow = "hidden";
      if (el.tagName === "IFRAME") {
        el.setAttribute("width", String(MOBILE_MAX_AD_WIDTH));
        el.setAttribute("scrolling", "no");
      }
    });
  }

  function clampMobileAdFrame(divId) {
    if (!isMobileViewport()) {
      return;
    }
    var node = document.getElementById(divId);
    if (!node) {
      return;
    }
    clampMobileAdNode(node);
    var host = node.closest && node.closest(".adswp, .state_advClass, .divider-wrap");
    if (host) {
      host.style.maxWidth = MOBILE_MAX_AD_WIDTH + "px";
      host.style.width = "100%";
      host.style.marginLeft = "auto";
      host.style.marginRight = "auto";
      host.style.overflow = "hidden";
      host.style.boxSizing = "border-box";
    }
  }

  function scheduleMobileClamp(divId) {
    clampMobileAdFrame(divId);
    if (w.requestAnimationFrame) {
      w.requestAnimationFrame(function () {
        clampMobileAdFrame(divId);
      });
    }
    [50, 200, 600].forEach(function (ms) {
      w.setTimeout(function () {
        clampMobileAdFrame(divId);
      }, ms);
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
    var observer = new MutationObserver(function () {
      scheduleMobileClamp(divId);
    });
    observer.observe(node, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "width", "height"],
    });
  }

  function ensureMobileAdStyles() {
    if (!isMobileViewport() || document.getElementById("apk-ad-mobile-css")) {
      return;
    }
    var style = document.createElement("style");
    style.id = "apk-ad-mobile-css";
    style.textContent =
      "@media " +
      MOBILE_BREAKPOINT +
      "{" +
      "body.page-form,body.page-result,body.page-list,body.page-teach,body.page-state{" +
      "overflow-x:clip!important;max-width:100vw;}" +
      ".contents,.detail-left,.state-content{" +
      "overflow-x:clip!important;max-width:100%!important;min-width:0!important;}" +
      ".adswp,.state_advClass,.divider-wrap.state_advClass," +
      ".teach-ad.adswp,.state-ad.adswp,.home-hero-ad.adswp," +
      "#adv1,#adv2,#adv3,.ads{" +
      "max-width:" +
      MOBILE_MAX_AD_WIDTH +
      "px!important;width:100%!important;margin-left:auto!important;margin-right:auto!important;" +
      "overflow:hidden!important;box-sizing:border-box!important;}" +
      ".adswp [id^='apk-ad-'],.state_advClass [id^='apk-ad-']," +
      "[id^='apk-ad-'],div[id^='google_ads_iframe_']{" +
      "max-width:min(" +
      MOBILE_MAX_AD_WIDTH +
      "px,100vw)!important;width:100%!important;margin-left:auto!important;" +
      "margin-right:auto!important;overflow:hidden!important;box-sizing:border-box!important;}" +
      ".adswp [id^='apk-ad-'] iframe,.state_advClass [id^='apk-ad-'] iframe," +
      "[id^='apk-ad-'] iframe,.adswp iframe,div[id^='google_ads_iframe_'] iframe{" +
      "max-width:min(" +
      MOBILE_MAX_AD_WIDTH +
      "px,100vw)!important;width:100%!important;margin-left:auto!important;" +
      "margin-right:auto!important;box-sizing:border-box!important;display:block!important;}" +
      "}";
    document.head.appendChild(style);
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
        scheduleMobileClamp(divId);
        observeMobileAdClamp(divId);
        return;
      }
      if (!shouldShowEmptyPlaceholder()) {
        return;
      }
      showEmptyPlaceholder(divId, event.slot.getAdUnitPath());
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

  function loadScript(src, id) {
    return new Promise(function (resolve, reject) {
      if (id && document.getElementById(id)) {
        resolve();
        return;
      }
      var existing = document.querySelector('script[src="' + src + '"]');
      if (existing) {
        if (existing.getAttribute("data-loaded") === "1") {
          resolve();
          return;
        }
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }

      var script = document.createElement("script");
      script.async = true;
      script.src = src;
      if (id) {
        script.id = id;
      }
      script.onload = function () {
        script.setAttribute("data-loaded", "1");
        resolve();
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function ensureGptSdk() {
    if (sdkPromise) {
      return sdkPromise;
    }
    w.googletag = w.googletag || { cmd: [] };
    sdkPromise = loadScript(
      "https://securepubads.g.doubleclick.net/tag/js/gpt.js",
      "apk-adx-sdk"
    );
    return sdkPromise;
  }

  function renderAdx(slotKey, el) {
    var path = getAdxPath(slotKey);
    if (!path) {
      console.warn("[ApkAd] ADX slot not configured:", slotKey);
      return;
    }

    ensureMobileAdStyles();

    if (el.getAttribute("data-apk-ad-pending") === "1") {
      return;
    }
    el.setAttribute("data-apk-ad-pending", "1");

    var def = w.ADX_SLOT_DEFS[slotKey];
    var divId = resolveInstanceDivId(slotKey, el);
    var sizes = getAdxSizes(slotKey, def);

    el.innerHTML =
      '<div id="' +
      divId +
      '" style="' +
      getAdDivInlineStyle(el) +
      '"></div>';

    w.googletag = w.googletag || { cmd: [] };
    w.googletag.cmd.push(function () {
      var slot = definedAdxSlots[divId];
      if (!slot) {
        slot = w.googletag
          .defineSlot(path, sizes, divId)
          .addService(w.googletag.pubads());
        if (slot) {
          definedAdxSlots[divId] = slot;
        } else {
          console.warn(
            "[ApkAd] defineSlot 失败:",
            slotKey,
            path,
            sizes
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

      w.googletag.display(divId);
      observeMobileAdClamp(divId);
      el.setAttribute("data-apk-ad-loaded", "1");
      el.removeAttribute("data-apk-ad-pending");
    });
  }

  function render(slotKey, el) {
    if (!el || !isAdxMode() || isAdFreePage()) {
      return;
    }

    ensureGptSdk()
      .then(function () {
        renderAdx(slotKey, el);
      })
      .catch(function (err) {
        console.error("[ApkAd] GPT load failed:", err);
      });
  }

  w.ApkAdLoader = {
    render: render,
    ensureGptSdk: ensureGptSdk,
    ensureAdxServices: ensureAdxServices,
    registerOopSlot: registerOopSlot,
  };
})(window);
