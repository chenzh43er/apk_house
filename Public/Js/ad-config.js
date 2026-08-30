(function (w) {
  /**
   * 广告模式默认：改 mode 即可（adx | adsense）。
   *
   * ADX 与 AdSense 完全分离、互不干扰（同一页只走一条链路）：
   *   adx     → GPT (ad-loader / ad-oop / ad-slots-adx)，不加载 adsbygoogle.js
   *   adsense → adsbygoogle.js + googleAds.js 槽位，不加载 gpt.js、不跑 OOP
   *
   * 锚定（ADX）：GPT TOP_ANCHOR → GAM 单元 house_site/bottom_anchor，
   * 由网络内 AdSense 订单项 / Ad Exchange 回填；报表在 Ad Manager。
   *
   * URL 参数会覆盖本文件默认值（不写 localStorage）：
   *   ?ad=adsense → 强制 AdSense
   *   ?ad=adx     → 强制 ADX
   *   ?adtest=on|1|true  → AdSense/ADX 测试模式
   *   ?adtest=off|0|false → 关闭 AdSense 测试广告
   * 改 mode 后若未生效：去掉 URL 中的 ad 参数，并硬刷新（见 _headers 广告 JS 缓存）。
   */
  w.AD_CONFIG = {
    mode: "adsense",
    adsense: {
      client: "ca-pub-3481735481590354",
      /**
       * AdSense 测试广告（data-adtest="on"，不计费）：
       * 正式环境默认 false；URL ?adtest=on|1|true 可临时开测试。
       */
      testMode: false,
      /**
       * Auto ads 锚定（Overlay）：
       * - anchorAds: false 时不请求锚定
       * - anchorOverlays（官方 data-overlays，见 support.google.com/adsense/answer/7478225）：
       *   "top"               → 不写 data-overlays（默认偏顶部；勿用 bottom 覆盖）
       *   "bottom"            → 强制底部（仍可能出可折叠大展开）
       *   "collapsed-bottom"  → 仅底部细条（官方唯一可代码强制的细条）
       * 顶部细条：用 "top"，并在 AdSense 后台：位置「仅顶部」+ 取消「允许动态锚定」
       * - hideAnchorOnDesktop：true 时仅桌面隐藏；false = 桌面也显示
       */
      anchorAds: true,
      /** PC/全端底部锚定（data-overlays=bottom）；细条可用 collapsed-bottom */
      anchorOverlays: "bottom",
      hideAnchorOnDesktop: false,
    },

    adx: {
      /** GAM 网络代码；可用 npm run gam:networks 从 API 获取 */
      networkCode: "23357265712",
      /** 服务端 Ad Manager API 账号（凭证在 secrets/，勿放前端） */
      api: {
        projectId: "test1-500909",
        clientEmail: "test1-423@test1-500909.iam.gserviceaccount.com",
      },
      /**
       * ADX 测试模式（仅 URL 参数，不持久化）：
       * ?adtest=1        → 自有广告单元 + GPT 测试标记（不计费）
       * ?adtest=demo     → Google 演示广告位（验证 GPT 集成）
       */
      testMode: false,
      /** 本地测试时模拟的正式域名（GPT 不认可 127.0.0.1） */
      productionOrigin: "https://identityinsight.org",
      /**
       * GPT Out-of-Page（仅 ADX，且非 ad-free 页面）
       * - bottomAnchor：移动端锚定开关（现为 TOP_ANCHOR；竖屏且宽 320–1000px）
       * - bottomAnchorDesktopFallback：宽屏 PC 用不了 OOP 时，用底部 sticky banner 兜底
       * - 锚定必须等 body 可见后才 define+display（防 SRA 过早请求 / display:none 计印象）
       * - bottomAnchorMobileDelayMs：body 可见后手机再延迟毫秒数（默认 1200；与上面两问题无关时可调）
       * - interstitial：全屏穿插；移动端默认关闭（见 ad-oop.js），避免每次进页都弹
       * - interstitialOnMobile: true 可强制在移动端也开穿插（不推荐）
       */
      oop: {
        bottomAnchor: true,
        bottomAnchorDesktopFallback: true,
        bottomAnchorMobileDelayMs: 1200,
        interstitial: true,
        interstitialOnMobile: false,
        rightRail: false,
        interstitialTriggers: {
          navBar: true,
          // 关闭：本站多页用 body display:none 延迟展示，会误触发「窗口重新可见」
          unhideWindow: false,
        },
      },
    },
  };

  /** de/us/de-ch-at 的 index 落地页不加载任何 Google 广告 */
  function isLangIndexLandingPage() {
    var path = (w.location.pathname || "").replace(/\/+$/, "");
    return /^\/(de|us|de-ch-at)(\/index\.html)?$/i.test(path);
  }

  w.ApkAd = w.ApkAd || {};
  w.ApkAd.isAdFreePage = isLangIndexLandingPage;
  w.ApkAd.getGptSdkUrls = function () {
    var nc = w.AD_CONFIG.adx && w.AD_CONFIG.adx.networkCode;
    var urls = [];
    var primary = "https://securepubads.g.doubleclick.net/tag/js/gpt.js";
    if (nc) {
      primary += "?network-code=" + encodeURIComponent(nc);
    }
    urls.push(primary);
    /** Google 官方旧 CDN，库相同；securepubads 被 VPN/网络拦截时可 fallback */
    urls.push("https://www.googletagservices.com/tag/js/gpt.js");
    return urls;
  };
  w.ApkAd.getGptSdkUrl = function () {
    return w.ApkAd.getGptSdkUrls()[0];
  };
  w.AD_CONFIG.adFree = isLangIndexLandingPage();

  var params = new URLSearchParams(w.location.search);
  var urlMode = params.get("ad");
  if (urlMode === "adsense") {
    w.AD_CONFIG.mode = "adsense";
  } else if (urlMode === "adx") {
    w.AD_CONFIG.mode = "adx";
  }

  var adtest = params.get("adtest");
  if (adtest) {
    var adtestOn =
      adtest === "1" || adtest === "on" || adtest === "true";
    var adtestOff =
      adtest === "0" || adtest === "off" || adtest === "false";

    if (w.AD_CONFIG.mode === "adx") {
      if (adtest === "demo") {
        w.AD_CONFIG.adx.testMode = "demo";
      } else if (adtestOn) {
        w.AD_CONFIG.adx.testMode = true;
      }
    }

    if (w.AD_CONFIG.mode === "adsense" && w.AD_CONFIG.adsense) {
      if (adtestOn) {
        w.AD_CONFIG.adsense.testMode = true;
      } else if (adtestOff) {
        w.AD_CONFIG.adsense.testMode = false;
      }
    }
  }

  function markAdModeClass() {
    var root = document.documentElement;
    if (!root || !root.classList) {
      return;
    }
    root.classList.remove("apk-ad-adx", "apk-ad-adsense");
    root.classList.add(
      w.AD_CONFIG.mode === "adx" ? "apk-ad-adx" : "apk-ad-adsense"
    );
  }
  markAdModeClass();

  /** 可选：仅桌面隐藏 AdSense Auto ads 锚定（默认关闭，允许锚定出现） */
  function hideAdsenseDesktopAnchors() {
    if (w.AD_CONFIG.mode === "adx") {
      return;
    }
    var ads = w.AD_CONFIG.adsense || {};
    if (!ads.hideAnchorOnDesktop) {
      return;
    }
    if (!(w.matchMedia && w.matchMedia("(min-width: 769px)").matches)) {
      return;
    }
    var nodes = document.querySelectorAll(
      "ins.adsbygoogle[data-anchor-status], ins.adsbygoogle-noablate[data-anchor-status], #google_top_anchor, #google_bottom_anchor"
    );
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].style.setProperty("display", "none", "important");
    }
  }

  /**
   * AdSense 顶部锚定避让：盖住首屏手动广告会直接拉低 Active View。
   * 复用 ADX 的 html.apk-has-top-anchor + --apk-top-anchor-h（见 ad-mobile.css）。
   *
   * 注意：禁止对整棵树监听 style/class——本函数会改 html 的 style/class，
   * 否则 MutationObserver 自触发死循环，页面白屏卡死（如 /us/teach/state）。
   */
  var adsenseAnchorSyncing = false;
  var adsenseAnchorTimer = 0;
  var lastAdsenseAnchorH = -1;

  function syncAdsenseTopAnchorOffset() {
    if (w.AD_CONFIG.mode === "adx" || !document.documentElement) {
      return;
    }
    if (adsenseAnchorSyncing) {
      return;
    }
    adsenseAnchorSyncing = true;
    try {
      var root = document.documentElement;
      var top =
        document.getElementById("google_top_anchor") ||
        document.querySelector(
          'ins.adsbygoogle[data-anchor-status][data-anchor-shown="true"], ins.adsbygoogle-noablate[data-anchor-status][data-anchor-shown="true"]'
        );
      var h = 0;
      if (top) {
        var cs = w.getComputedStyle(top);
        var hidden =
          cs.display === "none" ||
          cs.visibility === "hidden" ||
          cs.opacity === "0";
        if (!hidden) {
          h = Math.round(top.getBoundingClientRect().height) || 0;
        }
      }
      if (h === lastAdsenseAnchorH) {
        return;
      }
      lastAdsenseAnchorH = h;
      if (h >= 20) {
        root.classList.add("apk-has-top-anchor");
        root.style.setProperty("--apk-top-anchor-h", h + "px");
      } else {
        root.classList.remove("apk-has-top-anchor");
        root.style.removeProperty("--apk-top-anchor-h");
      }
    } finally {
      adsenseAnchorSyncing = false;
    }
  }

  function scheduleAdsenseAnchorSync() {
    if (adsenseAnchorTimer) {
      return;
    }
    adsenseAnchorTimer = w.setTimeout(function () {
      adsenseAnchorTimer = 0;
      hideAdsenseDesktopAnchors();
      syncAdsenseTopAnchorOffset();
    }, 80);
  }

  hideAdsenseDesktopAnchors();
  syncAdsenseTopAnchorOffset();
  if (w.AD_CONFIG.mode !== "adx" && document.documentElement) {
    if (typeof MutationObserver !== "undefined") {
      var adSenseAnchorObs = new MutationObserver(scheduleAdsenseAnchorSync);
      adSenseAnchorObs.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        // 只盯锚定相关属性；勿含 style/class（会自触发卡死）
        attributeFilter: ["data-anchor-status", "data-anchor-shown"],
      });
    }
    w.addEventListener("resize", scheduleAdsenseAnchorSync);
  }

  /** AdSense SDK 仅在 AdSense 模式加载（ad-free 页面跳过） */
  if (w.AD_CONFIG.adFree) {
    return;
  }

  /** ADX 模式预连接并尽早加载 GPT SDK（与 AdSense 的 adsbygoogle.js 同理） */
  if (w.AD_CONFIG.mode === "adx") {
    /**
     * ADX 模式：用代码挡住可能被 GTM/历史标签拉起的 AdSense 页级/锚定，
     * 避免与 GPT TOP_ANCHOR 叠两层。无需改 AdSense 后台。
     */
    w.adsbygoogle = w.adsbygoogle || [];
    w.adsbygoogle.pauseAdRequests = 1;

    [
      "https://securepubads.g.doubleclick.net",
      "https://www.googletagservices.com",
    ].forEach(function (gptOrigin) {
      ["preconnect", "dns-prefetch"].forEach(function (rel) {
        var link = document.createElement("link");
        link.rel = rel;
        link.href = gptOrigin;
        document.head.appendChild(link);
      });
    });
    if (!document.getElementById("apk-adx-sdk")) {
      w.googletag = w.googletag || { cmd: [] };
      var gptScript = document.createElement("script");
      gptScript.async = true;
      gptScript.id = "apk-adx-sdk";
      gptScript.src = w.ApkAd.getGptSdkUrl();
      gptScript.crossOrigin = "anonymous";
      gptScript.onerror = function () {
        gptScript.setAttribute("data-failed", "1");
      };
      gptScript.onload = function () {
        gptScript.setAttribute("data-loaded", "1");
      };
      document.head.appendChild(gptScript);
    }
  }

  if (w.AD_CONFIG.mode !== "adx") {
    var adsenseCfg = w.AD_CONFIG.adsense || {};
    var client = adsenseCfg.client;
    if (client) {
      var s = document.createElement("script");
      s.async = true;
      s.src =
        "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" +
        encodeURIComponent(client);
      s.crossOrigin = "anonymous";
      /**
       * 官方 data-overlays：仅 bottom / collapsed-bottom 有文档。
       * "top" 或空：不设置属性，避免覆盖后台「仅顶部」；见 ad-config 注释。
       * https://support.google.com/adsense/answer/7478225
       */
      if (adsenseCfg.anchorAds !== false) {
        var overlays = adsenseCfg.anchorOverlays;
        if (overlays === "bottom" || overlays === "collapsed-bottom") {
          s.setAttribute("data-overlays", overlays);
        }
      }
      document.head.appendChild(s);
    }
  }
})(window);
