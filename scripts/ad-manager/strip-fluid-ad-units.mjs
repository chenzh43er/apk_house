#!/usr/bin/env node
/**
 * 从 GAM 所有内容广告单元移除 Fluid 尺寸，并与 slots.mjs 对齐为固定像素尺寸。
 *
 * 用法:
 *   npm run gam:strip-fluid:dry-run
 *   npm run gam:strip-fluid
 */
import { GAM_API } from "./config.mjs";
import { ADX_SLOT_DEFS } from "./slots.mjs";
import {
  hasFluidSize,
  listAllAdUnits,
  patchAdUnit,
  pixelSizesFromRest,
  sizesToRest,
} from "./rest-client.mjs";

const dryRun = process.argv.includes("--dry-run");

function resolvePath(u) {
  const chain = (u.parentPath || [])
    .map((p) => p.adUnitCode)
    .filter(Boolean);
  if (u.adUnitCode) chain.push(u.adUnitCode);
  const skip = new Set([
    GAM_API.networkCode,
    "ca-pub-3481735481590354",
    "ca-pub-7335996243328726-tag",
    "ca-mb-app-pub-7335996243328726-tag",
  ]);
  return chain.filter((c) => !skip.has(c)).join("/");
}

function formatSizes(adUnitSizes) {
  if (!adUnitSizes?.length) return "(none)";
  return adUnitSizes
    .map((s) => {
      const sz = s.size;
      if (sz?.sizeType === "FLUID") return "Fluid";
      if (sz?.sizeType === "IGNORED") return "OOP";
      return `${sz?.width}x${sz?.height}`;
    })
    .join(", ");
}

function expectedSizesForUnit(u) {
  const code = u.adUnitCode;
  if (!code) {
    return null;
  }
  for (const def of Object.values(ADX_SLOT_DEFS)) {
    if (def.unit.split("/").pop() === code) {
      return sizesToRest(def.sizes);
    }
  }
  return null;
}

function buildTargetSizes(u) {
  const fromSlots = expectedSizesForUnit(u);
  if (fromSlots?.length) {
    return fromSlots;
  }
  return pixelSizesFromRest(u.adUnitSizes);
}

function sizesEqual(a, b) {
  const norm = (list) =>
    (list || [])
      .map((entry) => {
        const sz = entry.size;
        return `${sz.sizeType}:${sz.width}x${sz.height}`;
      })
      .sort()
      .join("|");
  return norm(a) === norm(b);
}

async function main() {
  console.log("GAM 广告单元：移除 Fluid 尺寸");
  console.log(`network: ${GAM_API.networkCode}`);
  console.log(`模式: ${dryRun ? "dry-run" : "正式更新"}\n`);

  const units = await listAllAdUnits(GAM_API.networkCode);
  const targets = units.filter((u) => {
    if (!u.adUnitCode || !u.adUnitSizes?.length) {
      return false;
    }
    const hasOopOnly = u.adUnitSizes.every(
      (entry) =>
        entry?.size?.sizeType === "IGNORED" ||
        entry?.size?.sizeType === "INTERSTITIAL"
    );
    if (hasOopOnly) {
      return false;
    }
    const target = buildTargetSizes(u);
    if (!target.length) {
      return false;
    }
    return hasFluidSize(u.adUnitSizes) || !sizesEqual(u.adUnitSizes, target);
  });

  if (!targets.length) {
    console.log("✓ 所有内容广告单元已无 Fluid，且尺寸与 slots.mjs 一致。");
    return;
  }

  console.log(`待更新 ${targets.length} 个广告单元:\n`);

  let updated = 0;
  for (const u of targets) {
    const path = resolvePath(u);
    const before = formatSizes(u.adUnitSizes);
    const targetSizes = buildTargetSizes(u);
    const after = formatSizes(targetSizes);

    console.log(`• ${path}`);
    console.log(`  当前: ${before}`);
    console.log(`  目标: ${after}`);

    if (dryRun) {
      continue;
    }

    await patchAdUnit(
      u.name,
      { name: u.name, adUnitSizes: targetSizes },
      "adUnitSizes"
    );
    console.log("  ✓ 已更新");
    updated++;
  }

  console.log(
    dryRun
      ? `\n(dry-run) 将更新 ${targets.length} 个单元。确认后运行: npm run gam:strip-fluid`
      : `\n完成。已更新 ${updated} 个广告单元。`
  );
}

main().catch((err) => {
  console.error("\n错误:", err.message || err);
  if (err.data?.error) {
    console.error(JSON.stringify(err.data.error, null, 2));
  }
  process.exit(1);
});
