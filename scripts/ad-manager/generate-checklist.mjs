import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listParentFolders, listUnitsToCreate, ADX_OOP_DEFS } from "./slots.mjs";

const lines = [];
lines.push("Google Ad Manager 手动创建清单");
lines.push("networkCode: 23357265712");
lines.push("后台: https://admanager.google.com/23357265712#inventory/ad_unit/list");
lines.push("");
lines.push("顺序: 先建父级目录，再建子广告位。Ad unit code 必须与下列名称完全一致。");
lines.push("");

lines.push("=== 第一步：父级目录（9 个，不填尺寸 / 仅作容器）===");
for (const folder of listParentFolders()) {
  const code = folder.split("/").pop();
  const parent = folder.includes("/") ? folder.split("/").slice(0, -1).pop() : "(根下)";
  lines.push(`  [父级] code=${code}  路径=${folder}  上级=${parent}`);
}

lines.push("");
lines.push("=== 第二步：广告位（38 个，Display，按 sizes 填尺寸）===");
for (const row of listUnitsToCreate()) {
  const sizeStr = row.sizes
    .map((s) => (s === "fluid" ? "Fluid" : `${s[0]}x${s[1]}`))
    .join(", ");
  lines.push(
    `  [广告位] code=${row.code}  路径=${row.fullPath}  尺寸=${sizeStr}  (前端 slot: ${row.slotKey})`
  );
}

lines.push("");
lines.push("=== 第三步：Out-of-Page 广告单元（GAM 后台手动创建，类型选 Out-of-page）===");
for (const [slotKey, def] of Object.entries(ADX_OOP_DEFS)) {
  lines.push(
    `  [OOP] code=${def.unit.split("/").pop()}  路径=${def.unit}  格式=${def.format}  (前端: ${slotKey})`
  );
}

lines.push("");
lines.push("=== 无广告页面（不加载 Google 广告 JS）===");
lines.push("  /de/index.html  /us/index.html  /de-ch-at/index.html");

lines.push("");
lines.push("=== GPT 路径示例 ===");
lines.push("  /23357265712/house_result/result_adv1");
lines.push("  /23357265712/house_detail/detail_adv1");
lines.push("  /23357265712/house_site/bottom_anchor");
lines.push("  /23357265712/house_site/interstitial");
lines.push("");
lines.push("创建完成后，页面加 ?ad=adx 测试。");
lines.push("锚定预览：URL 加 #gamBottomAnchorDemo");

const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "ad-units-checklist.txt");
fs.writeFileSync(outPath, lines.join("\n"), "utf8");
console.log("已生成:", outPath);
