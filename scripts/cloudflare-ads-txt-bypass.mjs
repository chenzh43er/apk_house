#!/usr/bin/env node
/**
 * 确保 Google / AdSense 爬虫能访问 ads.txt 与 robots.txt。
 *
 * 背景：免费版 Bot Fight Mode 不在 Ruleset Engine 内，WAF Skip 无法绕过它。
 * 本脚本会：
 *   1. 关闭 Bot Fight Mode（改由 Worker traffic-guard.js 防护 HTML）
 *   2. 添加 WAF Skip 规则（ads.txt / robots.txt / cf.client.bot）
 *   3. 添加 Configuration Rule（对上述路径关闭 BIC、降低 Security Level）
 *
 * 凭证：CLOUDFLARE_API_TOKEN 或 wrangler login 后的 OAuth
 * 所需权限：Zone Settings:Edit + Zone WAF:Edit + Config Rules:Edit
 *
 * 用法：
 *   node scripts/cloudflare-ads-txt-bypass.mjs
 *   node scripts/cloudflare-ads-txt-bypass.mjs --dry-run
 */

import fs from "node:fs";

const ZONE_NAME = "apkintelligence.com";
const dryRun = process.argv.includes("--dry-run");
const API = "https://api.cloudflare.com/client/v4";

const BYPASS_EXPR =
  '(http.request.uri.path eq "/ads.txt") or (http.request.uri.path eq "/robots.txt") or cf.client.bot';

function readWranglerOAuthToken() {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const candidates = [
    process.env.WRANGLER_HOME,
    `${home}/.wrangler/config/default.toml`,
    `${home}/AppData/Roaming/xdg.config/.wrangler/config/default.toml`,
  ].filter(Boolean);

  for (const file of candidates) {
    try {
      const text = fs.readFileSync(file, "utf8");
      const match = text.match(/^oauth_token\s*=\s*"([^"]+)"/m);
      if (match) return match[1];
    } catch {
      // continue
    }
  }
  return null;
}

function getApiToken() {
  return process.env.CLOUDFLARE_API_TOKEN || readWranglerOAuthToken();
}

async function cf(path, init = {}) {
  const token = getApiToken();
  if (!token) {
    throw new Error(
      "缺少 CLOUDFLARE_API_TOKEN。请创建 Token（Zone Settings:Edit + Zone WAF:Edit + Config Rules:Edit）或运行 wrangler login"
    );
  }

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
    err.status = res.status;
    throw err;
  }
  return data.result;
}

async function getZoneId() {
  const zones = await cf(`/zones?name=${ZONE_NAME}`);
  const zone = zones.find((z) => z.name === ZONE_NAME);
  if (!zone) throw new Error(`找不到 zone: ${ZONE_NAME}`);
  return zone.id;
}

async function setZoneSetting(zoneId, settingId, value) {
  console.log(`→ Zone 设置 ${settingId} = ${JSON.stringify(value)}`);
  if (dryRun) return;
  await cf(`/zones/${zoneId}/settings/${settingId}`, {
    method: "PATCH",
    body: JSON.stringify({ value }),
  });
}

async function upsertPhaseRule(zoneId, phase, descriptor) {
  const ruleset = await cf(
    `/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`
  );
  const existing = ruleset.rules || [];
  const idx = existing.findIndex(
    (r) => r.ref === descriptor.ref || r.description === descriptor.description
  );

  const rule = { ...descriptor, enabled: true };
  let rules;
  if (idx >= 0) {
    rules = existing.map((r, i) => (i === idx ? { ...r, ...rule } : r));
  } else if (phase === "http_request_firewall_custom") {
    // Skip 规则放最前，优先于 block 规则
    rules = [rule, ...existing];
  } else {
    rules = [...existing, rule];
  }

  console.log(
    `→ ${phase} 规则 "${descriptor.description}" (${idx >= 0 ? "更新" : "新增"})`
  );
  if (dryRun) return;

  await cf(`/zones/${zoneId}/rulesets/${ruleset.id}`, {
    method: "PUT",
    body: JSON.stringify({
      name: ruleset.name,
      description: ruleset.description,
      rules,
    }),
  });
}

async function main() {
  console.log(`ads.txt / robots.txt 放行配置 — ${ZONE_NAME}${dryRun ? " (dry-run)" : ""}\n`);

  const zoneId = await getZoneId();
  console.log(`Zone ID: ${zoneId}\n`);

  // 免费 Bot Fight Mode 无法用 Skip 绕过，必须关闭；HTML 由 Worker traffic-guard 保护
  await setZoneSetting(zoneId, "bot_fight_mode", "off");

  // WAF Skip：verified bot + ads.txt + robots.txt
  await upsertPhaseRule(zoneId, "http_request_firewall_custom", {
    ref: "ads_txt_bypass_skip",
    description: "Skip security for ads.txt, robots.txt, verified bots",
    expression: BYPASS_EXPR,
    action: "skip",
    action_parameters: {
      products: ["bic", "securityLevel", "uaBlock", "waf"],
      phases: ["http_request_sbfm", "http_ratelimit", "http_request_firewall_managed"],
    },
    logging: { enabled: false },
  });

  // Configuration Rule：对 ads.txt / robots.txt 关闭 BIC、降低安全级别
  await upsertPhaseRule(zoneId, "http_config_settings", {
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

  console.log("\n完成。请验证：");
  console.log("  curl.exe -sI https://apkintelligence.com/ads.txt");
  console.log("  curl.exe -sI https://apkintelligence.com/robots.txt");
  console.log("  期望 HTTP/1.1 200（不再是 403 Challenge）");
}

main().catch((err) => {
  console.error("\n失败:", err.message || err);
  if (err.status === 403 || String(err.message).includes("Authentication")) {
    console.error(`
需要更高权限的 API Token：
  1. 打开 https://dash.cloudflare.com/profile/api-tokens
  2. 创建 Custom Token，权限：
     - Zone > Zone Settings > Edit
     - Zone > Zone WAF > Edit
     - Zone > Config Rules > Edit
     - Zone > Zone > Read
  3. 运行：
     $env:CLOUDFLARE_API_TOKEN="你的token"
     node scripts/cloudflare-ads-txt-bypass.mjs
`);
  }
  process.exit(1);
});
