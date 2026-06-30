import fs from "node:fs";
import { GAM_API } from "./config.mjs";
import {
  diagnoseNetworkAccess,
  getNetwork,
  listNetworks,
} from "./rest-client.mjs";

const key = JSON.parse(fs.readFileSync(GAM_API.credentialsPath, "utf8"));

console.log("Ad Manager 网络列表（REST API）：\n");
console.log("服务账号:", key.client_email);
console.log("GCP 项目:", key.project_id);
console.log("目标 networkCode:", GAM_API.networkCode);
console.log("");

const diag = await diagnoseNetworkAccess(GAM_API.networkCode);

if (process.env.GAM_DEBUG) {
  console.log("DEBUG list:", diag.list.status, JSON.stringify(diag.list.body));
  console.log("DEBUG get:", diag.get.status, JSON.stringify(diag.get.body));
  console.log("");
}

let networks = await listNetworks();

if (!networks.length) {
  try {
    const direct = await getNetwork(GAM_API.networkCode);
    networks = [direct];
  } catch {
    // 下方统一输出诊断
  }
}

if (!networks.length) {
  console.log("未返回任何 network。\n");

  if (diag.list.status === 200 && diag.get.status === 401) {
    console.log("诊断：OAuth 正常，但该服务账号尚未绑定到 GAM 网络。");
    console.log("GET /networks → HTTP 200（空列表）");
    console.log(
      `GET /networks/${GAM_API.networkCode} → HTTP 401（${diag.get.reason || "无权限"}）\n`
    );
  } else {
    console.log("诊断：");
    console.log(`  GET /networks → HTTP ${diag.list.status}`);
    console.log(`  GET /networks/${GAM_API.networkCode} → HTTP ${diag.get.status}`);
    if (diag.get.body?.error?.message) {
      console.log(`  错误: ${diag.get.body.error.message}`);
    }
    console.log("");
  }

  console.log("请在 GAM 后台完成以下步骤：");
  console.log("1. 打开 https://admanager.google.com/" + GAM_API.networkCode);
  console.log("2. Admin → Global settings → Network settings");
  console.log("3. 确认已启用 API access");
  console.log("4. 点击 Add a service account user");
  console.log("5. 填入邮箱:", key.client_email);
  console.log("6. 保存后等待 1～2 分钟，再重新运行 npm run gam:networks");
  console.log("");
  console.log("GCP 侧（若尚未启用）：");
  console.log(
    "  https://console.cloud.google.com/apis/library/admanager.googleapis.com?project=" +
      key.project_id
  );
  process.exit(1);
}

networks.forEach((n) => {
  console.log(
    `- networkCode: ${n.networkCode}${n.displayName ? ` (${n.displayName})` : ""}`
  );
  if (n.effectiveRootAdUnit) {
    console.log(`  rootAdUnit: ${n.effectiveRootAdUnit}`);
  }
});

console.log("\n当前 config 中 networkCode:", GAM_API.networkCode);
console.log("文档: https://developers.google.com/ad-manager/api/beta/reference/rest/v1/networks/list");
