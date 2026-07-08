(function (w) {
  /**
   * 广告模式默认：改 mode 即可（adx | adsense）。
   *
   * ADX 与 AdSense 完全分离、互不干扰（同一页只走一条链路）：
   *   adx     → GPT (ad-loader / ad-oop / ad-slots-adx)，不加载 adsbygoogle.js
   *   adsense → adsbygoogle.js + googleAds.js 槽位，不加载 gpt.js、不跑 OOP
   *
   * URL 参数会覆盖本文件默认值（不写 localStorage）：
   *   ?ad=adsense → 强制 AdSense
   *   ?ad=adx     → 强制 ADX
   * 改 mode 后若未生效：去掉 URL 中的 ad 参数，并硬刷新（见 _headers 广告 JS 缓存）。
   */
  w.AD_CONFIG = {
    mode: "adx",
    adsense: {
      client: "ca-pub-3481735481590354",
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
       * - bottomAnchor：底部锚定条（移动端保留）
       * - interstitial：全屏穿插；移动端默认关闭（见 ad-oop.js），避免每次进页都弹
       * - interstitialOnMobile: true 可强制在移动端也开穿插（不推荐）
       */
      oop: {
        bottomAnchor: true,
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
  if (w.AD_CONFIG.mode === "adx" && adtest) {
    if (adtest === "demo") {
      w.AD_CONFIG.adx.testMode = "demo";
    } else if (adtest === "1" || adtest === "on" || adtest === "true") {
      w.AD_CONFIG.adx.testMode = true;
    }
  }

  /** AdSense SDK 仅在 AdSense 模式加载（ad-free 页面跳过） */
  if (w.AD_CONFIG.adFree) {
    return;
  }

  /** ADX 模式预连接并尽早加载 GPT SDK（与 AdSense 的 adsbygoogle.js 同理） */
  if (w.AD_CONFIG.mode === "adx") {
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
    var client = w.AD_CONFIG.adsense && w.AD_CONFIG.adsense.client;
    if (client) {
      var s = document.createElement("script");
      s.async = true;
      s.src =
        "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" +
        encodeURIComponent(client);
      s.crossOrigin = "anonymous";
      document.head.appendChild(s);
    }
  }
})(window);
