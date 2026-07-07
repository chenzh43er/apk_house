/**
 * 在 GAM 根广告单元启用 AdSense 回填（appliedAdsenseEnabled=true）。
 * 若根单元被关闭，所有子单元的 effectiveAdsenseEnabled 均为 false，
 * AdSense / Ad Exchange Line Item 将无法填充。
 *
 * 用法：
 *   npm run gam:enable-adsense
 *   npm run gam:enable-adsense -- --dry-run
 */
import { gamRequest, getNetwork, listAllAdUnits } from "./rest-client.mjs";
import { GAM_API } from "./config.mjs";

const dryRun = process.argv.includes("--dry-run");

const network = await getNetwork(GAM_API.networkCode);
const rootName = network.effectiveRootAdUnit;
if (!rootName) {
  throw new Error("无法获取 effectiveRootAdUnit");
}

const root = await gamRequest("GET", `/${rootName}`);
console.log(`network: ${GAM_API.networkCode}`);
console.log(`根单元: ${root.adUnitCode}`);
console.log(
  `当前 AdSense: applied=${root.appliedAdsenseEnabled} effective=${root.effectiveAdsenseEnabled}\n`
);

if (root.effectiveAdsenseEnabled === true) {
  console.log("✓ 根单元 AdSense 已开启，无需修改。");
} else if (dryRun) {
  console.log("[dry-run] 将 PATCH appliedAdsenseEnabled=true");
} else {
  const updated = await gamRequest(
    "PATCH",
    `/${rootName}?updateMask=appliedAdsenseEnabled`,
    { name: rootName, appliedAdsenseEnabled: true }
  );
  console.log(
    `✓ 已更新: applied=${updated.appliedAdsenseEnabled} effective=${updated.effectiveAdsenseEnabled}`
  );
}

const units = await listAllAdUnits(GAM_API.networkCode);
const leaf = units.filter(
  (u) => u.adUnitCode && !u.hasChildren && !u.adUnitCode.includes("pub")
);
const enabled = leaf.filter((u) => u.effectiveAdsenseEnabled === true).length;
console.log(`\n内容广告位 ${leaf.length} 个，AdSense 已生效: ${enabled}`);
