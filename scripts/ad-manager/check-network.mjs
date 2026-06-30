import fs from "node:fs";
import { GAM_API } from "./config.mjs";
import { curlRequest, readWindowsSystemProxy, resolveProxy } from "./request.mjs";
import { diagnoseNetworkAccess, listNetworks } from "./rest-client.mjs";

function probeOAuth(proxy) {
  const started = Date.now();
  try {
    const res = curlRequest("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=invalid",
      proxy,
      timeoutSec: 30,
    });
    const ms = Date.now() - started;
    const ok = res.status >= 400 && res.status < 500;
    console.log(`${ok ? "✓" : "✗"} Google OAuth`);
    console.log(`  HTTP ${res.status} (${ms}ms)\n`);
    return ok;
  } catch (err) {
    console.log(`✗ Google OAuth: ${err.message}\n`);
    return false;
  }
}

async function probeGamRest() {
  const started = Date.now();
  try {
    const networks = await listNetworks();
    const diag = await diagnoseNetworkAccess(GAM_API.networkCode);
    const ms = Date.now() - started;
    console.log(`✓ Ad Manager REST API 可达`);
    console.log(`  GET /v1/networks → HTTP ${diag.list.status}, ${networks.length} 个网络 (${ms}ms)`);
    networks.forEach((n) => {
      console.log(`  - ${n.networkCode}${n.displayName ? ` (${n.displayName})` : ""}`);
    });
    if (!networks.length) {
      const email = JSON.parse(fs.readFileSync(GAM_API.credentialsPath, "utf8")).client_email;
      console.log(`  GET /v1/networks/${GAM_API.networkCode} → HTTP ${diag.get.status}`);
      console.log(`  请在 GAM Admin 添加服务账号: ${email}`);
    }
    console.log("");
    return networks.length > 0;
  } catch (err) {
    const ms = Date.now() - started;
    console.log(`✗ Ad Manager REST API (${ms}ms)`);
    console.log(`  ${err.message}\n`);
    return false;
  }
}

console.log("Ad Manager API 检测（REST + curl 代理）\n");
const proxy = resolveProxy();
console.log("GAM_PROXY:", process.env.GAM_PROXY || "(未设置)");
console.log("Windows 系统代理:", readWindowsSystemProxy() || "(未检测到)");
console.log("实际代理:", proxy || "(无)\n");

const oauthOk = probeOAuth(proxy);
let restOk = false;

if (oauthOk) {
  console.log("继续测试 Ad Manager REST API...\n");
  restOk = await probeGamRest();
}

if (oauthOk && restOk) {
  console.log("全部通过:");
  console.log("  npm run gam:networks");
  console.log("  npm run gam:create-units");
  process.exit(0);
}

if (oauthOk && !restOk) {
  console.log("OAuth 正常但 REST 失败，请确认 GAM 已添加服务账号 API 用户。");
  process.exit(1);
}

console.log("请先: npm run gam:probe 设置 GAM_PROXY");
process.exit(1);
