/**
 * ADX / Google Ad Manager 广告位配置
 * 在 Ad Manager 中按相同逻辑名称新建广告单元后，更新 path 即可。
 * path 格式：/{networkCode}/{页面}/{广告位名称}
 */
(function (w) {
  var fluidBanner = ["fluid", [300, 250], [728, 90]];
  var fluidRect = ["fluid", [300, 250]];
  var rect600 = [[300, 600], "fluid"];

  w.ADX_SLOT_DEFS = {
    index_adv1: { unit: "house_index/house_index1", sizes: fluidBanner },

    teach_adv1: { unit: "teach/teach_adv1", sizes: fluidBanner },
    teach_adv2: { unit: "teach/teach_adv2", sizes: fluidRect },
    teach_adv3: { unit: "teach/teach_adv3", sizes: fluidRect },

    state_adv1: { unit: "house_address3/state_adv1", sizes: fluidBanner },
    state_adv2: { unit: "house_address3/state_adv2", sizes: fluidRect },
    state_adv3: { unit: "house_address3/state_adv3", sizes: [[300, 600], "fluid", [300, 250]] },

    city_adv1: { unit: "house_address3/city_adv1", sizes: fluidBanner },
    city_adv2: { unit: "house_address3/city_adv2", sizes: fluidRect },
    city_adv3: { unit: "house_address3/city_adv3", sizes: fluidRect },

    district_adv1: { unit: "house_address3/district_adv1", sizes: fluidBanner },
    district_adv2: { unit: "house_address3/district_adv2", sizes: fluidRect },
    district_adv3: { unit: "house_address3/district_adv3", sizes: fluidRect },

    list_adv1: { unit: "house_list/list_adv1", sizes: fluidBanner },
    list_adv2: { unit: "house_list/list_adv2", sizes: fluidRect },
    list_adv3: { unit: "house_list/list_adv3", sizes: rect600 },
    list_adv4: { unit: "house_list/list_adv4", sizes: fluidRect },

    detail_adv1: { unit: "house_detail/detail_adv1", sizes: fluidBanner },
    detail_adv2: { unit: "house_detail/detail_adv2", sizes: fluidBanner },
    detail_adv3: { unit: "house_detail/detail_adv3", sizes: fluidRect },
    detail_adv4: { unit: "house_detail/detail_adv4", sizes: rect600 },
    detail_adv5: { unit: "house_detail/detail_adv5", sizes: fluidRect },

    form_adv1: { unit: "house_form/form_adv1", sizes: fluidBanner },
    form_adv2: { unit: "house_form/form_adv2", sizes: fluidBanner },
    form_adv3: { unit: "house_form/form_adv3", sizes: fluidRect },
    form_adv4: { unit: "house_form/form_adv4", sizes: fluidRect },
    form_adv5: { unit: "house_form/form_adv5", sizes: fluidRect },

    result_adv1: { unit: "house_result/result_adv1", sizes: fluidBanner },
    result_adv2: { unit: "house_result/result_adv2", sizes: fluidBanner },
    result_adv3: { unit: "house_result/result_adv3", sizes: fluidRect },
    result_adv4: { unit: "house_result/result_adv4", sizes: fluidRect },
    result_adv5: { unit: "house_result/result_adv5", sizes: fluidRect },

    post_adv1: { unit: "house_post/post_adv1", sizes: fluidRect },
    post_adv2: { unit: "house_post/post_adv2", sizes: fluidBanner },
    post_adv3: { unit: "house_post/post_adv3", sizes: fluidBanner },
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
