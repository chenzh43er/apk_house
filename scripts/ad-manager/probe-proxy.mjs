import { curlRequest, readWindowsSystemProxy, resolveProxy } from "./request.mjs";

const TEST_URL = "https://oauth2.googleapis.com/token";

const COMMON_PORTS = [1080, 10808, 7890, 7897, 8080, 8889, 33210, 6152, 10809];

function proxyCandidates() {
  const list = [];
  const add = (p) => {
    if (p && !list.includes(p)) list.push(p);
  };

  add(process.env.GAM_PROXY);
  add(process.env.ALL_PROXY);
  add(process.env.HTTPS_PROXY);
  add(process.env.HTTP_PROXY);
  add(readWindowsSystemProxy());

  for (const port of COMMON_PORTS) {
    add(`socks5h://127.0.0.1:${port}`);
    add(`http://127.0.0.1:${port}`);
  }
  return list.filter(Boolean);
}

function tryProxy(proxy) {
  const started = Date.now();
  try {
    const { status } = curlRequest(TEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=invalid",
      proxy,
    });
    const ms = Date.now() - started;
    // 400/401 说明已连上 Google，只是 grant_type 无效
    if (status >= 400 && status < 500) {
      return { ok: true, proxy, status, ms };
    }
    return { ok: false, proxy, status, ms, err: `HTTP ${status}` };
  } catch (err) {
    return { ok: false, proxy, ms: Date.now() - started, err: err.message };
  }
}

console.log("优连 / 代理端口探测（使用 curl，支持 SOCKS5）\n");
console.log("当前环境变量 GAM_PROXY:", process.env.GAM_PROXY || "(未设置)");
console.log("HTTPS_PROXY:", process.env.HTTPS_PROXY || "(未设置)");
console.log("Windows 系统代理:", readWindowsSystemProxy() || "(未启用或未检测到)");
console.log("resolveProxy():", resolveProxy() || "(无)\n");

console.log("正在测试常见代理地址（可能需要 1～2 分钟）...\n");

const candidates = proxyCandidates();
let winner = null;

for (const proxy of candidates) {
  process.stdout.write(`  测试 ${proxy} ... `);
  const r = tryProxy(proxy);
  if (r.ok) {
    console.log(`✓ 可用 (HTTP ${r.status}, ${r.ms}ms)`);
    winner = proxy;
    break;
  }
  console.log(`✗ ${r.err || "失败"} (${r.ms}ms)`);
}

console.log("");
if (winner) {
  console.log("=== 找到可用代理 ===");
  console.log(winner);
  console.log("");
  console.log("请在 PowerShell 中执行（当前窗口有效）：");
  console.log(`  $env:GAM_PROXY="${winner}"`);
  console.log("  npm run gam:check");
  console.log("  npm run gam:create-units");
  console.log("");
  console.log("说明: 优连多为 SOCKS5，请用 socks5h:// 而不是 http://127.0.0.1:1080");
  process.exit(0);
}

console.log("=== 未找到可用代理 ===");
console.log("");
console.log("请在优连客户端中查看「本地代理 / 端口 / 协议」：");
console.log("  - 若是 SOCKS5 → $env:GAM_PROXY=\"socks5h://127.0.0.1:端口\"");
console.log("  - 若是 HTTP  → $env:GAM_PROXY=\"http://127.0.0.1:端口\"");
console.log("");
console.log("或在优连中开启「系统代理 / 全局模式」，再运行: npm run gam:probe");
console.log("也可改用手动清单: scripts/ad-manager/ad-units-checklist.txt");
process.exit(1);
