/**
 * ADX / Google Ad Manager 广告位配置
 * 在 Ad Manager 中按相同逻辑名称新建广告单元后，更新 path 即可。
 * path 格式：/{networkCode}/{页面}/{广告位名称}
 */
(function (w) {
  /** PC：含 728×90；移动端 defineSlot 仅用 mobileSizes（300×250） */
  var bannerSizes = [[300, 250], [728, 90]];
  var bannerMobile = [[300, 250]];
  var rectSizes = [[300, 250]];
  var rect600 = [[300, 600], [300, 250]];

  function bannerSlot(unit) {
    return { unit: unit, sizes: bannerSizes, mobileSizes: bannerMobile };
  }

  w.ADX_SLOT_DEFS = {
    index_adv1: bannerSlot("house_index/house_index1"),

    teach_adv1: bannerSlot("teach/teach_adv1"),
    teach_adv2: { unit: "teach/teach_adv2", sizes: rectSizes },
    teach_adv3: { unit: "teach/teach_adv3", sizes: rectSizes },

    state_adv1: bannerSlot("house_address3/state_adv1"),
    state_adv2: { unit: "house_address3/state_adv2", sizes: rectSizes },
    state_adv3: { unit: "house_address3/state_adv3", sizes: rect600 },

    city_adv1: bannerSlot("house_address3/city_adv1"),
    city_adv2: { unit: "house_address3/city_adv2", sizes: rectSizes },
    city_adv3: { unit: "house_address3/city_adv3", sizes: rectSizes },

    district_adv1: bannerSlot("house_address3/district_adv1"),
    district_adv2: { unit: "house_address3/district_adv2", sizes: rectSizes },
    district_adv3: { unit: "house_address3/district_adv3", sizes: rectSizes },

    list_adv1: bannerSlot("house_list/list_adv1"),
    list_adv2: { unit: "house_list/list_adv2", sizes: rectSizes },
    list_adv3: { unit: "house_list/list_adv3", sizes: rect600 },
    list_adv4: { unit: "house_list/list_adv4", sizes: rectSizes },

    detail_adv1: bannerSlot("house_detail/detail_adv1"),
    detail_adv2: bannerSlot("house_detail/detail_adv2"),
    detail_adv3: { unit: "house_detail/detail_adv3", sizes: rectSizes },
    detail_adv4: { unit: "house_detail/detail_adv4", sizes: rect600 },
    detail_adv5: { unit: "house_detail/detail_adv5", sizes: rectSizes },

    form_adv1: bannerSlot("house_form/form_adv1"),
    form_adv2: bannerSlot("house_form/form_adv2"),
    form_adv3: { unit: "house_form/form_adv3", sizes: rectSizes },
    form_adv4: { unit: "house_form/form_adv4", sizes: rectSizes },
    form_adv5: { unit: "house_form/form_adv5", sizes: rectSizes },

    result_adv1: bannerSlot("house_result/result_adv1"),
    result_adv2: bannerSlot("house_result/result_adv2"),
    result_adv3: { unit: "house_result/result_adv3", sizes: rectSizes },
    result_adv4: { unit: "house_result/result_adv4", sizes: rectSizes },
    result_adv5: { unit: "house_result/result_adv5", sizes: rectSizes },

    post_adv1: { unit: "house_post/post_adv1", sizes: rectSizes },
    post_adv2: bannerSlot("house_post/post_adv2"),
    post_adv3: bannerSlot("house_post/post_adv3"),
  };

  /** Out-of-Page：锚定 / 穿插（GAM 需建 Out-of-page 类型广告单元） */
  w.ADX_OOP_DEFS = {
    bottom_anchor: {
      unit: "house_site/bottom_anchor",
      format: "BOTTOM_ANCHOR",
    },
    interstitial: {
      unit: "house_site/interstitial",
      format: "INTERSTITIAL",
    },
    right_rail: {
      unit: "house_site/right_rail",
      format: "RIGHT_SIDE_RAIL",
    },
  };
})(window);
