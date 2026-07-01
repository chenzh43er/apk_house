/**
 * 页面仍调用 loadXxx_advN(el)。
 * ADX 与 AdSense 分离、互不干扰：同一请求只走其中一条链路。
 *   adx     → ApkAdLoader（GPT），不 push adsbygoogle
 *   adsense → googleAds.js innerHTML + adsbygoogle.push，不调用 ApkAdLoader
 */
(function (w) {
  var loaderMap = {
    loadTeach_adv: "teach_adv1",
    loadTeach_adv2: "teach_adv2",
    loadTeach_adv3: "teach_adv3",

    loadState_adv1: "state_adv1",
    loadState_adv2: "state_adv2",
    loadState_adv3: "state_adv3",

    loadCity_adv1: "city_adv1",
    loadCity_adv2: "city_adv2",
    loadCity_adv3: "city_adv3",

    loadDistrict_adv1: "district_adv1",
    loadDistrict_adv2: "district_adv2",
    loadDistrict_adv3: "district_adv3",

    loadList_adv1: "list_adv1",
    loadList_adv2: "list_adv2",
    loadList_adv3: "list_adv3",
    loadList_adv4: "list_adv4",

    loadDetail_adv1: "detail_adv1",
    loadDetail_adv2: "detail_adv2",
    loadDetail_adv3: "detail_adv3",
    loadDetail_adv4: "detail_adv4",
    loadDetail_adv5: "detail_adv5",

    loadForm_adv1: "form_adv1",
    loadForm_adv2: "form_adv2",
    loadForm_adv3: "form_adv3",
    loadForm_adv4: "form_adv4",
    loadForm_adv5: "form_adv5",

    loadResult_adv1: "result_adv1",
    loadResult_adv2: "result_adv2",
    loadResult_adv3: "result_adv3",
    loadResult_adv4: "result_adv4",
    loadResult_adv5: "result_adv5",

    loadPost_adv1: "post_adv1",
    loadPost_adv2: "post_adv2",
    loadPost_adv3: "post_adv3",

    loadListAdv_Test: "index_adv1",
  };

  function toAdsenseFnName(slotKey) {
    var i = slotKey.indexOf("_");
    if (i < 0) {
      return "return" + slotKey + "_ADS";
    }
    var page = slotKey.slice(0, i);
    var rest = slotKey.slice(i + 1);
    return (
      "return" +
      page.charAt(0).toUpperCase() +
      page.slice(1) +
      "_" +
      rest +
      "_ADS"
    );
  }

  function isAdxMode() {
    return w.AD_CONFIG && w.AD_CONFIG.mode === "adx";
  }

  function isAdFreePage() {
    return (
      (w.AD_CONFIG && w.AD_CONFIG.adFree) ||
      (w.ApkAd && w.ApkAd.isAdFreePage && w.ApkAd.isAdFreePage())
    );
  }

  /** 原有 AdSense 逻辑，不做异步、不依赖 ad-loader */
  function renderAdsense(slotKey, el) {
    var fnName = toAdsenseFnName(slotKey);
    var fn = w[fnName];
    if (typeof fn !== "function") {
      console.warn("[ApkAd] AdSense slot function missing:", fnName);
      return;
    }
    el.innerHTML = fn();
    try {
      (w.adsbygoogle = w.adsbygoogle || []).push({});
    } catch (e) {
      console.error("AdSense push error", e);
    }
  }

  Object.keys(loaderMap).forEach(function (fnName) {
    var slotKey = loaderMap[fnName];
    w[fnName] = function (el) {
      if (isAdFreePage()) {
        return;
      }
      if (isAdxMode()) {
        if (w.ApkAdLoader) {
          w.ApkAdLoader.render(slotKey, el);
        }
        return;
      }
      renderAdsense(slotKey, el);
    };
  });
})(window);
