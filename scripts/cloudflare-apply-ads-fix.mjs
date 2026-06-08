#!/usr/bin/env node
/**
 * 一键修复 ads.txt / robots.txt 被 Cloudflare Challenge 拦截。
 *
 * 用法：
 *   $env:CLOUDFLARE_API_TOKEN="你的token"
 *   node scripts/cloudflare-apply-ads-fix.mjs
 *
 * Token 创建：https://dash.cloudflare.com/profile/api-tokens
 * 权限：Zone Settings Edit + Zone WAF Edit + Config Rules Edit + Zone Read
 * 资源：Include → Specific zone → apkintelligence.com
 */

import fs from "node:fs";
import readline from "node:readline";

const ZONE_NAME = "apkintelligence.com";
const API = "https://api.cloudflare.com/client/v4";

const BYPASS_EXPR =
  '(http.request.uri.path eq "/ads.txt") or (http.request.uri.path eq "/robots.txt") or cf.client.bot';

function readWranglerOAuthToken() {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  for (const file of [
    process.env.WRANGLER_HOME,
    `${home}/AppData/Roaming/xdg.config/.wrangler/config/default.toml`,
    `${home}/.wrangler/config/default.toml`,
  ].filter(Boolean)) {
    try {
      const m = fs.readFileSync(file, "utf8").match(/^oauth_token\s*=\s*"([^"]+)"/m);
      if (m) return m[1];
    } catch {}
  }
  return null;
}

async function promptToken() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question("请粘贴 CLOUDFLARE_API_TOKEN 后回车: ", (t) => {
      rl.close();
      resolve(t.trim());
    });
  });
}

async function getToken() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  const oauth = readWranglerOAuthToken();
  if (oauth) return oauth;
  return promptToken();
}

async function cf(token, path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const data = await res.json();
  if (!data.success) {
    const err = new Error(JSON.stringify(data.errors || data, null, 2));
    err.code = data.errors?.[0]?.code;
    throw err;
  }
  return data.result;
}

async function setZoneSetting(token, zoneId, id, value) {
  console.log(`→ ${id} = ${JSON.stringify(value)}`);
  await cf(token, `/zones/${zoneId}/settings/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ value }),
  });
}

async function upsertPhaseRule(token, zoneId, phase, descriptor) {
  const ruleset = await cf(
    token,
    `/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`
  );
  const existing = ruleset.rules || [];
  const idx = existing.findIndex(
    (r) => r.ref === descriptor.ref || r.description === descriptor.description
  );
  const rule = { ...descriptor, enabled: true };
  const rules =
    idx >= 0
      ? existing.map((r, i) => (i === idx ? { ...r, ...rule } : r))
      : phase === "http_request_firewall_custom"
        ? [rule, ...existing]
        : [...existing, rule];

  console.log(`→ ${phase}: "${descriptor.description}" (${idx >= 0 ? "更新" : "新增"})`);
  await cf(token, `/zones/${zoneId}/rulesets/${ruleset.id}`, {
    method: "PUT",
    body: JSON.stringify({
      name: ruleset.name,
      description: ruleset.description,
      rules,
    }),
  });
}

async function verifyAdsTxt() {
  try {
    const res = await fetch(`https://${ZONE_NAME}/ads.txt`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AdsFixVerify/1.0)" },
    });
    const body = (await res.text()).trim();
    console.log(`\n验证 ads.txt → HTTP ${res.status}`);
    if (res.status === 200 && body.includes("pub-2289697662900935")) {
      console.log("✅ ads.txt 可访问，内容正确");
      return true;
    }
    if (res.status === 403) {
      console.log("⚠️  仍 403：配置传播中，或 Token 权限不足。等 2 分钟后重试。");
    } else {
      console.log("内容:", body.slice(0, 120));
    }
    return false;
  } catch (e) {
    console.log("验证请求失败:", e.message);
    return false;
  }
}

async function main() {
  console.log(`Cloudflare ads.txt 一键修复 — ${ZONE_NAME}\n`);

  let token = await getToken();
  if (!token) {
    console.error("需要 API Token。打开: https://dash.cloudflare.com/profile/api-tokens");
    process.exit(1);
  }

  let zoneId;
  try {
    const zones = await cf(token, `/zones?name=${ZONE_NAME}`);
    zoneId = zones.find((z) => z.name === ZONE_NAME)?.id;
    if (!zoneId) throw new Error("找不到 zone");
    console.log(`Zone ID: ${zoneId}\n`);
  } catch (e) {
    if (e.code === 9109 || String(e.message).includes("Authentication")) {
      console.error(`
❌ 当前凭证无写入权限（Wrangler OAuth 只有 zone:read）。

请创建 API Token（约 1 分钟）：
  1. 打开 https://dash.cloudflare.com/profile/api-tokens
  2. Create Token → Create Custom Token
  3. 权限：
       Zone → Zone Settings → Edit
       Zone → Zone WAF → Edit
       Zone → Config Rules → Edit
       Zone → Zone → Read
  4. Zone Resources → Include → Specific zone → apkintelligence.com
  5. Continue → Create Token → 复制

  6. 在本终端运行：
     $env:CLOUDFLARE_API_TOKEN="粘贴token"
     node scripts/cloudflare-apply-ads-fix.mjs
`);
      process.exit(1);
    }
    throw e;
  }

  await setZoneSetting(token, zoneId, "security_level", "essentially_off");
  await setZoneSetting(token, zoneId, "browser_check", "off");

  await upsertPhaseRule(token, zoneId, "http_request_firewall_custom", {
    ref: "ads_txt_bypass_skip",
    description: "Skip security for ads.txt, robots.txt, verified bots",
    expression: BYPASS_EXPR,
    action: "skip",
    action_parameters: {
      products: ["bic", "securityLevel", "uaBlock"],
      phases: [
        "http_request_sbfm",
        "http_ratelimit",
        "http_request_firewall_managed",
      ],
    },
    logging: { enabled: false },
  });

  await upsertPhaseRule(token, zoneId, "http_config_settings", {
    ref: "ads_txt_bypass_config",
    description: "Low security for ads.txt and robots.txt",
    expression:
      '(http.request.uri.path eq "/ads.txt") or (http.request.uri.path eq "/robots.txt")',
    action: "set_config",
    action_parameters: {
      bic: false,
      security_level: "essentially_off",
    },
  });

  console.log("\n✅ API 配置已提交");
  await verifyAdsTxt();
}

main().catch((e) => {
  console.error("\n失败:", e.message || e);
  process.exit(1);
});
