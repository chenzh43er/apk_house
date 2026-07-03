/** 与 Public/Js/ad-slots-adx.js 保持一致的广告位定义 */
export const fluidBanner = ["fluid", [300, 250], [728, 90]];
export const fluidRect = ["fluid", [300, 250]];
export const rect600 = [[300, 600], "fluid"];

export const ADX_SLOT_DEFS = {
  index_adv1: { unit: "house_index/house_index1", sizes: fluidBanner },

  teach_adv1: { unit: "teach/teach_adv1", sizes: fluidBanner },
  teach_adv2: { unit: "teach/teach_adv2", sizes: fluidRect },
  teach_adv3: { unit: "teach/teach_adv3", sizes: fluidRect },

  state_adv1: { unit: "house_address3/state_adv1", sizes: fluidBanner },
  state_adv2: { unit: "house_address3/state_adv2", sizes: fluidRect },
  state_adv3: { unit: "house_address3/state_adv3", sizes: fluidRect },

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
