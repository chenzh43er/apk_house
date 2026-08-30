/**
 * 页面仍调用 loadXxx_advN(el)。
 * ADX 与 AdSense 分离、互不干扰：同一请求只走其中一条链路。
 *   adx     → ApkAdLoader（GPT），不 push adsbygoogle
 *   adsense → googleAds.js innerHTML + adsbygoogle.push，不调用 ApkAdLoader
 *
 * AdSense Active View：须 ≥50% 像素在视口内持续约 1s。
 * 页面 IO 常用 threshold:0（刚露边就 load），此处再闸一道：
 * body 可见 + 槽位足够入屏后才 push，避免低可见率印象。
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

  function isAdsenseTestMode() {
    return !!(w.AD_CONFIG && w.AD_CONFIG.adsense && w.AD_CONFIG.adsense.testMode);
  }

  /** 测试模式只补 data-adtest="on"，不改 auto / 全宽响应式尺寸 */
  function withAdsenseTestAttr(html) {
    if (!isAdsenseTestMode() || !html) return html;
    return html.replace(/<ins\b([^>]*)>/gi, function (tag, attrs) {
      if (/\bdata-adtest\s*=/i.test(attrs)) return tag;
      return "<ins" + attrs + ' data-adtest="on">';
    });
  }

  function isBodyHidden() {
    return !!(document.body && document.body.style.display === "none");
  }

  function viewportHeight() {
    return w.innerHeight || (document.documentElement && document.documentElement.clientHeight) || 0;
  }

  /** 与 Active View 对齐：≥50% 槽位入屏，或高槽位覆盖 ≥50% 视口 */
  function isSlotEnoughVisible(el, entry) {
    var vh = viewportHeight();
    if (entry) {
      if (!entry.isIntersecting) {
        return false;
      }
      if (entry.intersectionRatio >= 0.5) {
        return true;
      }
      if (
        vh > 0 &&
        entry.intersectionRect &&
        entry.intersectionRect.height >= vh * 0.5
      ) {
        return true;
      }
      return false;
    }
    if (!el || !el.getBoundingClientRect) {
      return false;
    }
    var rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }
    var visibleH =
      Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
    if (visibleH / rect.height >= 0.5) {
      return true;
    }
    return vh > 0 && visibleH >= vh * 0.5;
  }

  function whenBodyVisible(cb) {
    if (!isBodyHidden()) {
      cb();
      return;
    }
    var done = false;
    function finish() {
      if (done || isBodyHidden()) {
        return;
      }
      done = true;
      if (obs) {
        obs.disconnect();
      }
      clearInterval(poll);
      cb();
    }
    var obs = null;
    if (typeof MutationObserver !== "undefined" && document.body) {
      obs = new MutationObserver(finish);
      obs.observe(document.body, {
        attributes: true,
        attributeFilter: ["style", "class", "hidden"],
      });
    }
    var poll = setInterval(finish, 120);
  }

  function whenAdsenseViewable(el, cb) {
    whenBodyVisible(function () {
      if (isSlotEnoughVisible(el, null)) {
        cb();
        return;
      }
      if (typeof IntersectionObserver === "undefined") {
        cb();
        return;
      }
      var obs = new IntersectionObserver(
        function (entries) {
          var entry = entries && entries[0];
          if (!isSlotEnoughVisible(el, entry)) {
            return;
          }
          obs.disconnect();
          cb();
        },
        { threshold: [0, 0.25, 0.5, 0.75, 1], rootMargin: "0px" }
      );
      obs.observe(el);
    });
  }

  function pushAdsense(el, html) {
    el.innerHTML = html;
    try {
      (w.adsbygoogle = w.adsbygoogle || []).push({});
      el.setAttribute("data-apk-ad-loaded", "1");
    } catch (e) {
      console.error("AdSense push error", e);
    }
  }

  /**
   * AdSense：等 body 可见且槽位足够入屏后再请求。
   * 勿调用 ADX clamp（overflow:hidden 会裁创意、拖垮可见率）。
   */
  function renderAdsense(slotKey, el) {
    if (!el) {
      return;
    }
    if (el.getAttribute("data-apk-adsense-pushed") === "1") {
      return;
    }
    if (el.getAttribute("data-apk-adsense-pending") === "1") {
      return;
    }

    var fnName = toAdsenseFnName(slotKey);
    var fn = w[fnName];
    if (typeof fn !== "function") {
      console.warn("[ApkAd] AdSense slot function missing:", fnName);
      return;
    }

    el.setAttribute("data-apk-adsense-pending", "1");
    var html = withAdsenseTestAttr(fn());

    whenAdsenseViewable(el, function () {
      if (el.getAttribute("data-apk-adsense-pushed") === "1") {
        return;
      }
      el.setAttribute("data-apk-adsense-pushed", "1");
      el.removeAttribute("data-apk-adsense-pending");
      pushAdsense(el, html);
    });
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
