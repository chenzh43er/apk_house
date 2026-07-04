/**
 * 将 AdSense 广告位 ID 写入 googleAds.js / googleAds_Test.js
 *
 * 用法：
 *   npm run adsense:apply -- --slot=1234567890          # 全部位共用 1 个 ID（测试最快）
 *   npm run adsense:apply -- --manifest=scripts/adsense/slots-manifest.json
 *   npm run adsense:apply -- --dry-run --slot=1234567890
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MANIFEST = path.join(ROOT, "scripts/adsense/slots-manifest.json");

const GOOGLE_ADS_FILES = [
  "Public/Js/googleAds.js",
  "Public/Js/googleAds_Test.js",
  "us/Public/Js/googleAds.js",
  "us/Public/Js/googleAds_Test.js",
  "de/Public/Js/googleAds.js",
  "de/Public/Js/googleAds_Test.js",
  "de-ch-at/Public/Js/googleAds.js",
  "de-ch-at/Public/Js/googleAds_Test.js",
];

function parseArgs(argv) {
  const out = { dryRun: false, slot: "", manifest: MANIFEST };
  for (const arg of argv) {
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg.startsWith("--slot=")) out.slot = arg.slice("--slot=".length).trim();
    else if (arg.startsWith("--manifest=")) out.manifest = path.resolve(arg.slice("--manifest=".length));
  }
  return out;
}

function slotMapFromManifest(manifestPath) {
  const data = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const map = {};
  for (const row of data.slots || []) {
    if (!row.key || !row.reportSlotId) continue;
    map[row.key] = String(row.reportSlotId);
  }
  return map;
}

function fnNameForKey(key) {
  const i = key.indexOf("_");
  if (i < 0) return `return${key}_ADS`;
  const page = key.slice(0, i);
  const rest = key.slice(i + 1);
  return `return${page.charAt(0).toUpperCase()}${page.slice(1)}_${rest}_ADS`;
}

function patchFile(filePath, slotByKey, universalSlot) {
  const abs = path.join(ROOT, filePath);
  let text = fs.readFileSync(abs, "utf8");
  let changes = 0;

  for (const [key, slotId] of Object.entries(slotByKey)) {
    const fnName = fnNameForKey(key);
    const re = new RegExp(
      `(function ${fnName}\\(\\)\\{[\\s\\S]*?data-ad-slot=")(\\d+)(")`,
      "m"
    );
    if (!re.test(text)) {
      console.warn(`  [skip] ${filePath}: 未找到 ${fnName}`);
      continue;
    }
    text = text.replace(re, `$1${slotId}$3`);
    changes += 1;
  }

  if (universalSlot) {
    const before = text;
    text = text.replace(/data-ad-slot="\d+"/g, `data-ad-slot="${universalSlot}"`);
    changes += (before.match(/data-ad-slot="\d+"/g) || []).length;
  }

  return { text, changes };
}

function main() {
  const { dryRun, slot, manifest } = parseArgs(process.argv.slice(2));
  let slotByKey = {};

  if (slot) {
    if (!/^\d+$/.test(slot)) {
      throw new Error(`--slot 必须是纯数字，收到: ${slot}`);
    }
    console.log(`模式: 全部广告位共用 slot ${slot}`);
  } else {
    slotByKey = slotMapFromManifest(manifest);
    const filled = Object.keys(slotByKey).length;
    if (!filled) {
      console.error(
        "manifest 里没有 reportSlotId。请先：\n" +
          "  1) 在 AdSense 后台创建广告单元\n" +
          "  2) 把 ID 填进 scripts/adsense/slots-manifest.json\n" +
          "或: npm run adsense:apply -- --slot=你的广告位ID"
      );
      process.exit(1);
    }
    console.log(`模式: manifest 已填 ${filled} 个 slot`);
  }

  let total = 0;
  for (const rel of GOOGLE_ADS_FILES) {
    const { text, changes } = patchFile(rel, slotByKey, slot || "");
    total += changes;
    if (changes === 0) continue;
    if (dryRun) {
      console.log(`[dry-run] ${rel}: ${changes} 处`);
    } else {
      fs.writeFileSync(path.join(ROOT, rel), text, "utf8");
      console.log(`[ok] ${rel}: ${changes} 处`);
    }
  }

  if (total === 0) {
    console.warn("没有更新任何文件");
    process.exit(1);
  }
  console.log(dryRun ? `dry-run 完成，共 ${total} 处` : `完成，共更新 ${total} 处`);
}

main();
