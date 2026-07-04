import { GAM_API } from "./config.mjs";
import { listAllAdUnits } from "./rest-client.mjs";
import { ADX_SLOT_DEFS } from "./slots.mjs";

const units = await listAllAdUnits(GAM_API.networkCode);
const byCode = new Map(
  units.filter((u) => u.adUnitCode).map((u) => [u.adUnitCode, u])
);

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
  if (!adUnitSizes?.length) return "(container)";
  return adUnitSizes
    .map((s) => {
      const sz = s.size;
      if (sz?.sizeType === "FLUID") return "Fluid";
      if (sz?.sizeType === "IGNORED") return "OOP";
      return `${sz?.width}x${sz?.height}`;
    })
    .join(", ");
}

console.log(`GAM 广告单元清单 (network ${GAM_API.networkCode})\n`);
console.log(`API 共返回 ${units.length} 个单元\n`);

const expected = Object.entries(ADX_SLOT_DEFS).map(([slotKey, def]) => ({
  slotKey,
  fullPath: def.unit,
  code: def.unit.split("/").pop(),
}));

let missing = 0;
let found = 0;

console.log("=== 前端 slot 与 GAM 对照 ===");
for (const row of expected) {
  const u = byCode.get(row.code);
  const path = u ? resolvePath(u) : null;
  const ok = path === row.fullPath;
  if (ok) {
    found++;
    console.log(`✓ ${row.slotKey.padEnd(14)} ${row.fullPath.padEnd(32)} ${formatSizes(u.adUnitSizes)}`);
  } else if (u) {
    console.log(`? ${row.slotKey.padEnd(14)} 期望=${row.fullPath}  实际=${path}`);
  } else {
    missing++;
    console.log(`✗ ${row.slotKey.padEnd(14)} ${row.fullPath.padEnd(32)} (未创建)`);
  }
}

console.log(`\n汇总: 匹配 ${found}，缺失 ${missing}，路径不一致 ${expected.length - found - missing}`);

const city = byCode.get("city_adv1");
if (city) {
  console.log("\n=== city_adv1 详情 ===");
  console.log("resource:", city.name);
  console.log("path:", resolvePath(city));
  console.log("sizes:", formatSizes(city.adUnitSizes));
  console.log("GPT:", `/${GAM_API.networkCode}/${resolvePath(city)}`);
}
