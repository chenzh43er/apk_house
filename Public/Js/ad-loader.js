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
    return normalizeGptSizes((def && def.sizes) || ["fluid"]);
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
    w.googletag.pubads().collapseEmptyDivs(!shouldShowEmptyPlaceholder());
    w.googletag.enableServices();
    adxServicesEnabled = true;
    displayOopSlots();
  }

  function applyAdxPageConfig() {
    var attrs = {};

    if (isAdxTestMode()) {
      attrs.adsense_test_mode = "on";
    }

    if (isLocalHost()) {
      var origin =
        (w.AD_CONFIG.adx && w.AD_CONFIG.adx.productionOrigin) ||
        "https://apkintelligence.com";
      attrs.page_url = origin + w.location.pathname + w.location.search;
    }

    if (!Object.keys(attrs).length) {
      return;
    }

    if (w.googletag.setConfig) {
      w.googletag.setConfig({ adsenseAttributes: attrs });
    } else {
      if (attrs.adsense_test_mode) {
        w.googletag.pubads().set("adsense_test_mode", "on");
      }
      if (attrs.page_url) {
        w.googletag.pubads().set("page_url", attrs.page_url);
      }
    }

    if (isAdxTestMode() && w.AD_CONFIG.adx.testMode === "demo") {
      console.info("[ApkAd] ADX demo：" + DEMO_AD_UNIT);
    } else if (isLocalHost()) {
      console.info("[ApkAd] 本地 ADX · page_url=" + attrs.page_url);
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
        "box-sizing:border-box;"
      );
    }
    return (
      "width:100%;max-width:100%;min-height:250px;text-align:center;" +
      "margin:8px auto;display:block;box-sizing:border-box;"
    );
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
      if (!event.isEmpty) {
        return;
      }
      if (!shouldShowEmptyPlaceholder()) {
        return;
      }
      showEmptyPlaceholder(
        event.slot.getSlotElementId(),
        event.slot.getAdUnitPath()
      );
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
