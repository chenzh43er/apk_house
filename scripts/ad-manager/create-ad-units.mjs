import { GAM_API } from "./config.mjs";
import { listParentFolders, listUnitsToCreate } from "./slots.mjs";
import {
  createAdUnit,
  getNetwork,
  listAllAdUnits,
  sizesToRest,
} from "./rest-client.mjs";

const dryRun = process.argv.includes("--dry-run");
const networkCode = GAM_API.networkCode;
const parentResource = `networks/${networkCode}`;

/** fullPath -> resource name; parentAdUnit|code -> resource name */
const nameByPath = new Map();
let existingByKey = new Map();

function unitKey(parentAdUnit, adUnitCode) {
  return `${parentAdUnit}|${adUnitCode}`;
}

function parentPathOf(folderPath) {
  const parts = folderPath.split("/");
  return parts.length <= 1 ? "" : parts.slice(0, -1).join("/");
}

function folderCode(folderPath) {
  return folderPath.split("/").pop();
}

function indexAdUnits(adUnits) {
  const byKey = new Map();
  for (const u of adUnits) {
    const key = `${u.parentAdUnit}|${u.adUnitCode || ""}`;
    byKey.set(key, u.name);
  }
  return byKey;
}

async function ensureAdUnit({ parentAdUnit, adUnitCode, displayName, sizes, label }) {
  const key = unitKey(parentAdUnit, adUnitCode);
  const existing = existingByKey.get(key) || nameByPath.get(label);

  if (existing && String(existing).startsWith("networks/")) {
    console.log(`  跳过（已存在）: ${label}`);
    return existing;
  }

  console.log(`  创建: ${label} (code=${adUnitCode})`);

  if (dryRun) {
    return `dry-${adUnitCode}`;
  }

  const payload = {
    displayName,
    adUnitCode,
    parentAdUnit,
  };
  const restSizes = sizesToRest(sizes);
  if (restSizes.length) {
    payload.adUnitSizes = restSizes;
  }

  const created = await createAdUnit(networkCode, payload);
  console.log(`  ✓ 已创建 ${created.name}`);
  return created.name;
}

async function main() {
  console.log("Ad Manager 创建广告单元（REST API）");
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
    for (const u of all) {
      const pathParts = (u.parentPath || [])
        .map((p) => p.adUnitCode)
        .concat(u.adUnitCode ? [u.adUnitCode] : []);
      if (pathParts.length) {
        nameByPath.set(pathParts.join("/"), u.name);
      }
      if (u.parentAdUnit && u.adUnitCode) {
        existingByKey.set(unitKey(u.parentAdUnit, u.adUnitCode), u.name);
      }
    }
    nameByPath.set("", rootAdUnit);
  } else {
    nameByPath.set("", rootAdUnit);
  }

  console.log("--- 1/2 创建父级目录 ---");
  for (const folderPath of listParentFolders()) {
    const parentPath = parentPathOf(folderPath);
    const parentAdUnit = parentPath
      ? nameByPath.get(parentPath)
      : rootAdUnit;
    if (!parentAdUnit) {
      throw new Error(`找不到父级: ${folderPath}`);
    }

    const code = folderCode(folderPath);
    const name = await ensureAdUnit({
      parentAdUnit,
      adUnitCode: code,
      displayName: code,
      sizes: null,
      label: folderPath,
    });
    nameByPath.set(folderPath, name);
  }

  console.log("\n--- 2/2 创建广告位 ---");
  let created = 0;
  let skipped = 0;

  for (const row of listUnitsToCreate()) {
    const parentAdUnit = nameByPath.get(row.parentPath);
    if (!parentAdUnit) {
      throw new Error(`找不到父级路径: ${row.parentPath} (${row.slotKey})`);
    }

    const had = existingByKey.has(unitKey(parentAdUnit, row.code));
    const name = await ensureAdUnit({
      parentAdUnit,
      adUnitCode: row.code,
      displayName: row.name,
      sizes: row.sizes,
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
    console.log("未实际创建。确认后运行: npm run gam:create-units");
  }
  console.log(`\nGPT 路径: /${networkCode}/house_result/result_adv1`);
  console.log("测试 ADX: 页面 URL 加 ?ad=adx");
}

main().catch((err) => {
  console.error("\n错误:", err.message || err);
  if (err.data?.error) {
    console.error(JSON.stringify(err.data.error, null, 2));
  }
  process.exit(1);
});
