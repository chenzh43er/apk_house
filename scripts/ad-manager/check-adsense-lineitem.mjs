/**
 * 校验 AdSense 订单项：Display 类型 / 全站定向 / 尺寸含 300×250 + 728×90 + 300×600
 * （AdSense 订单项无 Fluid 选项；fluid 由 AdX「请求中包含的所有尺寸」承接）
 *
 * 用法: node scripts/ad-manager/check-adsense-lineitem.mjs
 *       node scripts/ad-manager/check-adsense-lineitem.mjs --id=7360729816
 */
import { soapCall, pickTag, pickAllTags } from "./soap.mjs";
import { listAllAdUnits, getNetwork, gamRequest } from "./rest-client.mjs";
import { GAM_API } from "./config.mjs";

const REQUIRED_SIZES = [
  { w: 300, h: 250, label: "300x250" },
  { w: 728, h: 90, label: "728x90" },
  { w: 300, h: 600, label: "300x600" },
];

const cliId = process.argv.find((a) => a.startsWith("--id="))?.slice(5);

function sizesFromCreativePlaceholders(block) {
  const sizes = [];
  const sizeBlocks = [
    ...block.matchAll(/<creativePlaceholders>[\s\S]*?<\/creativePlaceholders>/g),
  ].map((m) => m[0]);
  for (const sb of sizeBlocks) {
    const sizeType =
      pickTag(sb, "creativeSizeType") || pickTag(sb, "sizeType");
    const w = pickTag(sb, "width");
    const h = pickTag(sb, "height");
    if (sizeType === "FLUID" || sizeType === "IGNORED") {
      sizes.push({ fluid: true, label: "Fluid" });
      continue;
    }
    if (sizeType === "INTERSTITIAL") {
      sizes.push({ interstitial: true, label: "Interstitial(OOP)" });
      continue;
    }
    if (w && h) sizes.push({ w: Number(w), h: Number(h), label: `${w}x${h}` });
  }
  // fallback: any <size> under placeholders
  if (!sizes.length) {
    for (const m of block.matchAll(/<size>([\s\S]*?)<\/size>/g)) {
      const chunk = m[1];
      const sizeType = pickTag(chunk, "sizeType");
      const w = pickTag(chunk, "width");
      const h = pickTag(chunk, "height");
      if (sizeType === "FLUID" || sizeType === "IGNORED") sizes.push({ fluid: true, label: "Fluid" });
      else if (w && h) sizes.push({ w: Number(w), h: Number(h), label: `${w}x${h}` });
    }
  }
  return sizes;
}

function hasSize(sizes, req) {
  if (req.fluid) return sizes.some((s) => s.fluid);
  return sizes.some((s) => s.w === req.w && s.h === req.h);
}

function targetingIsRon(targetingXml, rootAdUnitId) {
  if (!targetingXml) return { ron: true, detail: "无 targeting（Run of Network）" };
  const inv = targetingXml.match(/<inventoryTargeting>([\s\S]*?)<\/inventoryTargeting>/);
  if (!inv) return { ron: true, detail: "无 inventoryTargeting（Run of Network）" };

  const targetedBlocks = [...inv[1].matchAll(/<targetedAdUnits>([\s\S]*?)<\/targetedAdUnits>/g)];
  if (!targetedBlocks.length) {
    return { ron: true, detail: "未限定 targetedAdUnits（Run of Network / 网络随机广告）" };
  }

  const units = targetedBlocks.map((m) => ({
    id: pickTag(m[1], "adUnitId"),
    descendants: pickTag(m[1], "includeDescendants") === "true",
  }));

  // 仅定向根广告单元且包含子级 = 等同全站
  if (
    rootAdUnitId &&
    units.length === 1 &&
    units[0].id === String(rootAdUnitId) &&
    units[0].descendants
  ) {
    return {
      ron: true,
      detail: `根广告单元 ${rootAdUnitId} + includeDescendants（等同全站）`,
    };
  }

  const excluded = [...inv[1].matchAll(/<excludedAdUnits>[\s\S]*?<\/excludedAdUnits>/g)];
  return {
    ron: false,
    detail: `限定广告单元: ${units.map((u) => u.id).join(", ")}; excluded=${excluded.length}`,
  };
}

async function listAdSenseLineItems() {
  // PQL only filters; full LineItem objects (incl. creativePlaceholders / targeting) are returned.
  const query = cliId
    ? `WHERE Id = ${cliId}`
    : `WHERE LineItemType = 'ADSENSE'`;

  const xml = await soapCall(
    "LineItemService",
    `<v:getLineItemsByStatement>
      <v:filterStatement>
        <v:query>${query}</v:query>
      </v:filterStatement>
    </v:getLineItemsByStatement>`
  );

  const page = xml.match(/<rval>([\s\S]*?)<\/rval>/)?.[1] || xml;
  return [...page.matchAll(/<results>([\s\S]*?)<\/results>/g)].map((m) => m[1]);
}

function targetingXmlFromBlock(block) {
  const m = block.match(/<targeting>[\s\S]*?<\/targeting>/);
  return m ? m[0] : "";
}

async function checkRootAdsense() {
  const network = await getNetwork(GAM_API.networkCode);
  const root = await gamRequest("GET", `/${network.effectiveRootAdUnit}`);
  return {
    applied: root.appliedAdsenseEnabled,
    effective: root.effectiveAdsenseEnabled,
  };
}

console.log("=== AdSense 订单项校验 ===\n");
console.log(`network: ${GAM_API.networkCode}`);
console.log(`要求: Display(ADSENSE) / 全站(RON) / 尺寸: ${REQUIRED_SIZES.map((s) => s.label).join(" + ")}`);
console.log("说明: AdSense 订单项不支持 Fluid；fluid 请求由 AdX 订单项兜底\n");

const rootAds = await checkRootAdsense();
const rootAdUnitId = (await getNetwork(GAM_API.networkCode)).effectiveRootAdUnit
  ?.split("/")
  .pop();
console.log(
  `根广告单元 AdSense: applied=${rootAds.applied} effective=${rootAds.effective}` +
    (rootAds.effective === true ? "  ✓" : "  ✗ 根单元未开 AdSense，订单项无法填充")
);

const blocks = await listAdSenseLineItems();
if (!blocks.length) {
  console.log("\n✗ 未找到 ADSENSE 类型订单项。请在 GAM 后台创建：");
  console.log("  投放 → 订单 → 新建订单项 → 类型选 AdSense / 展示广告");
  console.log("  定向: 投放网络(Run of Network)");
  console.log("  预期广告素材尺寸: 300x250, 728x90, 300x600");
  process.exit(1);
}

let allPass = rootAds.effective === true;

for (const block of blocks) {
  const id = pickTag(block, "id");
  const name = pickTag(block, "name");
  const status = pickTag(block, "status");
  const type = pickTag(block, "lineItemType");
  const priority = pickTag(block, "priority");
  const costType = pickTag(block, "costType");
  const sizes = sizesFromCreativePlaceholders(block);
  const targetingXml = targetingXmlFromBlock(block);
  const ron = targetingIsRon(targetingXml, rootAdUnitId);

  const checks = [];
  const typeOk = type === "ADSENSE" || type === "PRICE_PRIORITY"; // some networks label differently
  // ADSENSE is the SOAP enum for AdSense backed display line items
  checks.push({
    label: "类型 Display / ADSENSE",
    ok: type === "ADSENSE",
    detail: `lineItemType=${type}`,
  });
  checks.push({
    label: "状态可投放",
    ok: status === "DELIVERING" || status === "READY",
    detail: `status=${status}`,
  });
  checks.push({
    label: "全站定向 (Run of Network)",
    ok: ron.ron,
    detail: ron.detail,
  });
  for (const req of REQUIRED_SIZES) {
    checks.push({
      label: `尺寸 ${req.label}`,
      ok: hasSize(sizes, req),
      detail: hasSize(sizes, req)
        ? "已配置"
        : `缺失（当前: ${sizes.map((s) => s.label).join(", ") || "无"}）`,
    });
  }

  const pass = checks.every((c) => c.ok);
  allPass = allPass && pass;

  console.log(`\n--- Line Item ${id}: ${name} ---`);
  console.log(`status=${status} type=${type} priority=${priority} costType=${costType}`);
  console.log(
    `creativePlaceholders: ${sizes.map((s) => s.label).join(", ") || "(空 — 请在「预期广告素材」添加尺寸)"}`
  );
  for (const c of checks) {
    console.log(`${c.ok ? "✓" : "✗"} ${c.label} — ${c.detail}`);
  }
  console.log(pass ? "→ 本订单项校验通过" : "→ 本订单项未通过，请按 ✗ 项在 GAM 后台修改");
}

const units = await listAllAdUnits(GAM_API.networkCode);
const sampleCodes = ["teach_adv1", "list_adv3", "detail_adv4", "home_adv1"];
console.log("\n=== 抽查广告单元尺寸（前端请求方）===");
for (const code of sampleCodes) {
  const u = units.find((x) => x.adUnitCode === code);
  if (!u) {
    console.log(`- ${code}: 未找到`);
    continue;
  }
  const sz = (u.adUnitSizes || [])
    .map((s) => (s.size?.sizeType === "FLUID" ? "Fluid" : `${s.size?.width}x${s.size?.height}`))
    .join(", ");
  const need = ["300x250", "728x90", "Fluid"];
  const miss = need.filter((n) => {
    if (n === "Fluid") return !sz.includes("Fluid");
    return !sz.split(", ").includes(n);
  });
  console.log(
    `${miss.length ? "✗" : "✓"} ${code}: ${sz || "(无尺寸)"}` +
      (miss.length ? `  缺: ${miss.join(", ")}` : "")
  );
}

console.log("\n=== 总结果 ===");
if (allPass) {
  console.log("✓ AdSense 订单项满足: Display / 全站 / 300×250 + 728×90 + 300×600");
  process.exit(0);
} else {
  console.log("✗ 校验未通过。请到 GAM → 投放 → 订单项，按上面 ✗ 项修改后重跑:");
  console.log("  node scripts/ad-manager/check-adsense-lineitem.mjs");
  process.exit(1);
}
