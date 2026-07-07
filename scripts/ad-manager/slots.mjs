/** 与 Public/Js/ad-slots-adx.js 保持一致的广告位定义 */
export const bannerSizes = [[300, 250], [728, 90]];
export const rectSizes = [[300, 250]];
export const rect600 = [[300, 600], [300, 250]];

export const ADX_SLOT_DEFS = {
  index_adv1: { unit: "house_index/house_index1", sizes: bannerSizes },

  teach_adv1: { unit: "teach/teach_adv1", sizes: bannerSizes },
  teach_adv2: { unit: "teach/teach_adv2", sizes: rectSizes },
  teach_adv3: { unit: "teach/teach_adv3", sizes: rectSizes },

  state_adv1: { unit: "house_address3/state_adv1", sizes: bannerSizes },
  state_adv2: { unit: "house_address3/state_adv2", sizes: rectSizes },
  state_adv3: { unit: "house_address3/state_adv3", sizes: rect600 },

  city_adv1: { unit: "house_address3/city_adv1", sizes: bannerSizes },
  city_adv2: { unit: "house_address3/city_adv2", sizes: rectSizes },
  city_adv3: { unit: "house_address3/city_adv3", sizes: rectSizes },

  district_adv1: { unit: "house_address3/district_adv1", sizes: bannerSizes },
  district_adv2: { unit: "house_address3/district_adv2", sizes: rectSizes },
  district_adv3: { unit: "house_address3/district_adv3", sizes: rectSizes },

  list_adv1: { unit: "house_list/list_adv1", sizes: bannerSizes },
  list_adv2: { unit: "house_list/list_adv2", sizes: rectSizes },
  list_adv3: { unit: "house_list/list_adv3", sizes: rect600 },
  list_adv4: { unit: "house_list/list_adv4", sizes: rectSizes },

  detail_adv1: { unit: "house_detail/detail_adv1", sizes: bannerSizes },
  detail_adv2: { unit: "house_detail/detail_adv2", sizes: bannerSizes },
  detail_adv3: { unit: "house_detail/detail_adv3", sizes: rectSizes },
  detail_adv4: { unit: "house_detail/detail_adv4", sizes: rect600 },
  detail_adv5: { unit: "house_detail/detail_adv5", sizes: rectSizes },

  form_adv1: { unit: "house_form/form_adv1", sizes: bannerSizes },
  form_adv2: { unit: "house_form/form_adv2", sizes: bannerSizes },
  form_adv3: { unit: "house_form/form_adv3", sizes: rectSizes },
  form_adv4: { unit: "house_form/form_adv4", sizes: rectSizes },
  form_adv5: { unit: "house_form/form_adv5", sizes: rectSizes },

  result_adv1: { unit: "house_result/result_adv1", sizes: bannerSizes },
  result_adv2: { unit: "house_result/result_adv2", sizes: bannerSizes },
  result_adv3: { unit: "house_result/result_adv3", sizes: rectSizes },
  result_adv4: { unit: "house_result/result_adv4", sizes: rectSizes },
  result_adv5: { unit: "house_result/result_adv5", sizes: rectSizes },

  post_adv1: { unit: "house_post/post_adv1", sizes: rectSizes },
  post_adv2: { unit: "house_post/post_adv2", sizes: bannerSizes },
  post_adv3: { unit: "house_post/post_adv3", sizes: bannerSizes },
};

/** Out-of-Page：锚定 / 穿插（GAM 后台需手动建 Out-of-page 类型单元） */
export const ADX_OOP_DEFS = {
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

/** 解析为 [{ parentCode, code, name, sizes, slotKey, fullPath }] */
export function listUnitsToCreate() {
  const rows = [];
  for (const [slotKey, def] of Object.entries(ADX_SLOT_DEFS)) {
    const parts = def.unit.split("/");
    const code = parts[parts.length - 1];
    const parentCode = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
    rows.push({
      slotKey,
      fullPath: def.unit,
      parentCode: parts.length > 1 ? parts[parts.length - 2] : "",
      parentPath: parts.slice(0, -1).join("/"),
      code,
      name: code,
      sizes: def.sizes,
    });
  }
  return rows;
}

/** OOP 单元列表（与 ADX_OOP_DEFS 一致） */
export function listOopUnitsToCreate() {
  return Object.entries(ADX_OOP_DEFS).map(([slotKey, def]) => {
    const parts = def.unit.split("/");
    return {
      slotKey,
      fullPath: def.unit,
      parentPath: parts.slice(0, -1).join("/"),
      code: parts[parts.length - 1],
      name: parts[parts.length - 1],
      format: def.format,
    };
  });
}

/** 所有需要存在的父级目录（按路径深度排序） */
export function listParentFolders() {
  const folders = new Set();
  const allDefs = { ...ADX_SLOT_DEFS, ...ADX_OOP_DEFS };
  for (const def of Object.values(allDefs)) {
    const parts = def.unit.split("/");
    for (let i = 1; i < parts.length; i++) {
      folders.add(parts.slice(0, i).join("/"));
    }
  }
  return [...folders].sort((a, b) => a.split("/").length - b.split("/").length);
}
