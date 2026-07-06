#!/usr/bin/env node
/**
 * 修复过度拦截：移除「非移动端 Challenge」+ 部署静态/爬虫 Skip + 降低全局安全级别。
 *
 * 所需权限：Zone Settings Edit + Zone WAF Edit + Config Rules Edit + Zone Read
 *
 * 用法：
 *   $env:CLOUDFLARE_API_TOKEN="你的token"
 *   node scripts/cloudflare-security-fix.mjs
 *   node scripts/cloudflare-security-fix.mjs --dry-run
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dryRun = process.argv.includes("--dry-run");

function run(scriptName, extraArgs = []) {
  const script = path.join(__dirname, scriptName);
  const args = [script, ...(dryRun ? ["--dry-run"] : []), ...extraArgs];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      stdio: "inherit",
      env: process.env,
      shell: false,
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${scriptName} exited with code ${code}`));
    });
  });
}

async function main() {
  console.log(
    `Cloudflare 安全规则修复 — identityinsight.org${dryRun ? " (dry-run)" : ""}\n`
  );
  console.log("步骤 1/2: 移除误杀规则 + 部署静态/爬虫 Skip …\n");
  await run("cloudflare-static-bot-bypass.mjs");

  console.log("\n步骤 2/2: 清理流量清洗规则（移除非移动端 Challenge）…\n");
  await run("cloudflare-traffic-guard-rules.mjs");

  if (!dryRun) {
    console.log("\n等待 90 秒后验证 …");
    await new Promise((r) => setTimeout(r, 90_000));
    await run("cloudflare-security-audit.mjs");
  }

  console.log("\n完成。若仍有 403，请在 Dashboard 手动确认：");
  console.log("  Security → Bots → Super Bot Fight Mode");
  console.log("    Verified bots = Allow");
  console.log("    Static resource protection = Off");
  console.log("    Definitely automated = Managed Challenge（勿选 Block）");
}

main().catch((err) => {
  console.error("\n失败:", err.message || err);
  process.exit(1);
});
