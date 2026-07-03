import { GAM_API } from "./config.mjs";
import { ADX_OOP_DEFS, listOopUnitsToCreate } from "./slots.mjs";
import {
  createAdUnit,
  getNetwork,
  listAllAdUnits,
  oopFormatToRestSizes,
} from "./rest-client.mjs";

const dryRun = process.argv.includes("--dry-run");
const networkCode = GAM_API.networkCode;
const OOP_PARENT = "house_site";

/** fullPath -> resource name; parentAdUnit|code -> resource name */
const nameByPath = new Map();
let existingByKey = new Map();

function unitKey(parentAdUnit, adUnitCode) {
  return `${parentAdUnit}|${adUnitCode}`;
}

function indexAdUnits(adUnits) {
  const byKey = new Map();
  for (const u of adUnits) {
    const key = `${u.parentAdUnit}|${u.adUnitCode || ""}`;
    byKey.set(key, u.name);
  }
  return byKey;
}

function resolveUnitPath(byCode, code) {
  const u = byCode.get(code);
  if (!u) return null;
  const chain = (u.parentPath || []).map((p) => p.adUnitCode).filter(Boolean);
  chain.push(code);
  const skip = new Set([
    "23357265712",
    "ca-pub-3481735481590354",
    "ca-pub-7335996243328726-tag",
    "ca-mb-app-pub-7335996243328726-tag",
  ]);
  return chain.filter((c) => !skip.has(c)).join("/");
}

async function ensureAdUnit({
  parentAdUnit,
  adUnitCode,
  displayName,
  adUnitSizes,
  label,
}) {
  const key = unitKey(parentAdUnit, adUnitCode);
  const existing = existingByKey.get(key) || nameByPath.get(label);

  if (existing && String(existing).startsWith("networks/")) {
    console.log(`  跳过（已存在）: ${label}`);
    return existing;
  }

  const sizeHint = adUnitSizes?.length
    ? adUnitSizes.map((s) => s.size?.sizeType || "PIXEL").join(", ")
    : "container";
  console.log(`  创建: ${label} (code=${adUnitCode}, sizes=${sizeHint})`);

  if (dryRun) {
    return `dry-${adUnitCode}`;
  }

  const payload = {
    displayName,
    adUnitCode,
    parentAdUnit,
  };
  if (adUnitSizes?.length) {
    payload.adUnitSizes = adUnitSizes;
  }

  const created = await createAdUnit(networkCode, payload);
  console.log(`  ✓ 已创建 ${created.name}`);
  return created.name;
}

async function main() {
  console.log("Ad Manager 创建 OOP 广告单元（REST API）");
  console.log(`networkCode: ${networkCode}`);
  console.log(`模式: ${dryRun ? "dry-run" : "正式创建"}\n`);

  const network = await getNetwork(networkCode);
  const rootAdUnit = network.effectiveRootAdUnit;
  if (!rootAdUnit) {
    throw new Error("无法获取 effectiveRootAdUnit");
  }
  console.log(`根广告单元: ${rootAdUnit}\n`);

  if (!dryRun) {
    const all = await listAllAdUnits(networkCode);
    existingByKey = indexAdUnits(all);
    const byCode = new Map(
      all.filter((u) => u.adUnitCode).map((u) => [u.adUnitCode, u])
    );
    for (const u of all) {
      const path = resolveUnitPath(byCode, u.adUnitCode);
      if (path) {
        nameByPath.set(path, u.name);
      }
      if (u.parentAdUnit && u.adUnitCode) {
        existingByKey.set(unitKey(u.parentAdUnit, u.adUnitCode), u.name);
      }
    }
  }
  nameByPath.set("", rootAdUnit);

  console.log("--- 1/2 创建父级 house_site ---");
  const parentName = await ensureAdUnit({
    parentAdUnit: rootAdUnit,
    adUnitCode: OOP_PARENT,
    displayName: OOP_PARENT,
    adUnitSizes: null,
    label: OOP_PARENT,
  });
  nameByPath.set(OOP_PARENT, parentName);

  console.log("\n--- 2/2 创建 OOP 子单元 ---");
  let created = 0;
  let skipped = 0;

  for (const row of listOopUnitsToCreate()) {
    const parent = nameByPath.get(row.parentPath);
    if (!parent) {
      throw new Error(`找不到父级路径: ${row.parentPath} (${row.slotKey})`);
    }

    const had = existingByKey.has(unitKey(parent, row.code));
    const name = await ensureAdUnit({
      parentAdUnit: parent,
      adUnitCode: row.code,
      displayName: row.name,
      adUnitSizes: oopFormatToRestSizes(row.format),
      label: row.fullPath,
    });
    nameByPath.set(row.fullPath, name);
    if (had && !dryRun) {
      skipped++;
    } else if (!dryRun && !name.startsWith("dry-")) {
      created++;
    }
  }

  console.log("\n完成。");
  if (!dryRun) {
    console.log(`新建: ${created}，已存在跳过: ${skipped}`);
  } else {
    console.log("未实际创建。确认后运行: npm run gam:create-oop-units");
  }

  console.log("\nGPT 路径:");
  for (const def of Object.values(ADX_OOP_DEFS)) {
    console.log(`  /${networkCode}/${def.unit}  (${def.format})`);
  }
  console.log("\n测试: 页面 URL 加 ?ad=adx，锚定预览加 #gamBottomAnchorDemo");
}

main().catch((err) => {
  console.error("\n错误:", err.message || err);
  if (err.data?.error) {
    console.error(JSON.stringify(err.data.error, null, 2));
  }
  process.exit(1);
});
