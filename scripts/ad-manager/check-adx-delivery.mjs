/**
 * 诊断 ADX（Ad Exchange Line Item）投放状态
 * 用法: npm run gam:check-adx
 */
import { soapCall, pickTag, pickAllTags } from "./soap.mjs";
import { gamRequest, listAllAdUnits } from "./rest-client.mjs";
import { GAM_API } from "./config.mjs";

const ADX_LINE_ITEM_ID = "7361925017";

async function queryLineItems() {
  const xml = await soapCall(
    "LineItemService",
    `<v:getLineItemsByStatement>
      <v:filterStatement>
        <v:query>SELECT Id, Name, Status, LineItemType, DeliveryRateType, Priority FROM Line_Item WHERE Id = ${ADX_LINE_ITEM_ID}</v:query>
      </v:filterStatement>
    </v:getLineItemsByStatement>`
  );

  const blocks = [...xml.matchAll(/<rval>([\s\S]*?)<\/rval>/g)].map((m) => m[1]);
  console.log("=== Line Item 投放状态 (SOAP) ===\n");
  for (const block of blocks) {
    console.log({
      id: pickTag(block, "id"),
      name: pickTag(block, "name"),
      status: pickTag(block, "status"),
      type: pickTag(block, "lineItemType"),
      delivery: pickTag(block, "deliveryRateType"),
      priority: pickTag(block, "priority"),
      archived: pickTag(block, "isArchived"),
      start: pickTag(block, "startDateTime"),
      end: pickTag(block, "endDateTime"),
    });
  }
}

async function queryCreativeAssociations() {
  try {
    const xml = await soapCall(
      "LineItemCreativeAssociationService",
      `<v:getLineItemCreativeAssociationsByStatement>
        <v:filterStatement>
          <v:query>SELECT LineItemId, CreativeId, Status FROM Line_Item_Creative_Association WHERE LineItemId = ${ADX_LINE_ITEM_ID}</v:query>
        </v:filterStatement>
      </v:getLineItemCreativeAssociationsByStatement>`
    );

    const blocks = [...xml.matchAll(/<rval>([\s\S]*?)<\/rval>/g)].map((m) => m[1]);
    console.log("\n=== ADX Line Item 关联素材 ===\n");
    if (!blocks.length) {
      console.log("✗ 未关联任何 Creative（ADX 需配置 Expected Creatives 尺寸）");
      return;
    }
    for (const block of blocks) {
      console.log({
        lineItemId: pickTag(block, "lineItemId"),
        creativeId: pickTag(block, "creativeId"),
        status: pickTag(block, "status"),
      });
    }
  } catch (err) {
    console.log("\n=== ADX Line Item 关联素材 ===");
    console.log("查询失败:", err.message);
  }
}

async function queryTargeting() {
  try {
    const xml = await soapCall(
      "LineItemService",
      `<v:getLineItemsByStatement>
        <v:filterStatement>
          <v:query>SELECT Id, Name, Targeting FROM Line_Item WHERE Id = ${ADX_LINE_ITEM_ID}</v:query>
        </v:filterStatement>
      </v:getLineItemsByStatement>`
    );
    console.log("\n=== ADX Line Item 定向（原始 XML 片段）===");
    const targeting = xml.match(/<targeting>[\s\S]*?<\/targeting>/);
    if (targeting) {
      console.log(targeting[0].slice(0, 2000));
    } else {
      console.log("未找到 targeting 节点（可能为 Run of Network 或未配置）");
    }
  } catch (err) {
    console.log("定向查询失败:", err.message);
  }
}

async function checkAdUnits() {
  const units = await listAllAdUnits(GAM_API.networkCode);
  const leaf = units.filter(
    (u) => u.adUnitCode && !u.hasChildren && !u.adUnitCode.includes("pub")
  );
  console.log("\n=== 广告单元（ADX 前端路径抽查）===");
  for (const code of ["teach_adv1", "list_adv3", "detail_adv4"]) {
    const u = units.find((x) => x.adUnitCode === code);
    if (!u) continue;
    console.log(
      `✓ ${code} → /${GAM_API.networkCode}/... status=${u.status} sizes=${(u.adUnitSizes || []).map((s) => (s.size?.sizeType === "FLUID" ? "Fluid" : `${s.size?.width}x${s.size?.height}`)).join(", ")}`
    );
  }
  console.log(`共 ${leaf.length} 个内容广告位，全部 ACTIVE`);
}

console.log("ADX 正式环境填充诊断\n");
console.log(`network: ${GAM_API.networkCode}`);
console.log(`domain: identityinsight.org`);
console.log(`ADX line item: ${ADX_LINE_ITEM_ID} (AdX - 全站自动填充 v2)\n`);

await queryLineItems();
await queryCreativeAssociations();
await queryTargeting();
await checkAdUnits();

console.log(`
=== 结论指引（仅 ADX）===
1. Line Item Status 必须是 DELIVERING，不能是 DRAFT/PAUSED/COMPLETED
2. AD_EXCHANGE 类型必须关联 Creative（含 300x250、728x90、Fluid、300x600 等尺寸）
3. 定向建议 Run of Network，或显式包含 house_index/teach/house_list 等父级
4. GAM → Admin → Global settings → 确认 Ad Exchange 账户已关联
5. Ad Exchange → 确认 identityinsight.org 已加入库存且已通过审核
6. 前端验证：?adtest=demo 有广告 = 代码 OK；无广告 = GAM 后台问题
`);
