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
      client: "ca-pub-2289697662900935",
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
      productionOrigin: "https://apkintelligence.com",
      /** GPT Out-of-Page：锚定 + 穿插（仅 ADX，且非 ad-free 页面） */
      oop: {
        bottomAnchor: true,
        interstitial: true,
        rightRail: false,
        interstitialTriggers: {
          navBar: true,
          unhideWindow: true,
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
