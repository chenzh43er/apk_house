#!/usr/bin/env node
/**
 * 通过 Cloudflare API 为 apkintelligence.com 启用基础 Bot / WAF 防护。
 *
 * 凭证（任选其一）：
 *   CLOUDFLARE_API_TOKEN — 需 Zone Settings:Edit + Firewall Services:Edit
 *   Wrangler OAuth — 运行 wrangler login 后自动读取
 *
 * 用法：
 *   node scripts/cloudflare-security-setup.mjs
 *   node scripts/cloudflare-security-setup.mjs --dry-run
 */

import fs from "node:fs";

const ZONE_NAME = "apkintelligence.com";
const dryRun = process.argv.includes("--dry-run");

const API = "https://api.cloudflare.com/client/v4";

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
      // try next path
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
      "缺少 CLOUDFLARE_API_TOKEN，且未找到 Wrangler OAuth 凭证。请先 wrangler login 或创建 API Token（需 Zone Settings:Edit + Firewall Services:Edit）"
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
    throw new Error(JSON.stringify(data.errors || data, null, 2));
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
  console.log(`→ 设置 ${settingId} = ${JSON.stringify(value)}`);
  if (dryRun) return;
  await cf(`/zones/${zoneId}/settings/${settingId}`, {
    method: "PATCH",
    body: JSON.stringify({ value }),
  });
}

async function upsertCustomWafRule(zoneId) {
  const ruleset = await cf(
    `/zones/${zoneId}/rulesets/phases/http_request_firewall_custom/entrypoint`
  );

  const blockRule = {
    description: "Block scraper UA on HTML pages (AdSense protection)",
    expression: `(http.request.uri.path matches "^/(de|us|de-ch-at)/?(form|result)(\\\\.html)?$" or http.request.uri.path matches "^/(de|us|de-ch-at)/teach/state/.+/(form|result)$") and (http.user_agent contains "headless" or http.user_agent contains "puppeteer" or http.user_agent contains "selenium" or http.user_agent contains "playwright" or http.user_agent contains "python-requests" or http.user_agent contains "scrapy" or http.user_agent eq "") and not cf.client.bot`,
    action: "block",
    enabled: true,
  };

  const existing = ruleset.rules || [];
  const idx = existing.findIndex(
    (r) => r.description === blockRule.description
  );

  const rules =
    idx >= 0
      ? existing.map((r, i) => (i === idx ? { ...r, ...blockRule } : r))
      : [...existing, blockRule];

  console.log(`→ 更新 WAF 自定义规则 (${rules.length} 条)`);
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
  console.log(`Cloudflare 安全配置 — ${ZONE_NAME}${dryRun ? " (dry-run)" : ""}`);

  const zoneId = await getZoneId();
  console.log(`Zone ID: ${zoneId}`);

  // 免费/Pro 可用：Bot Fight Mode
  await setZoneSetting(zoneId, "bot_fight_mode", "on");

  // 浏览器完整性检查（配合 Bot Fight）
  await setZoneSetting(zoneId, "browser_check", "on");

  // 安全级别：medium 平衡误杀与防护
  await setZoneSetting(zoneId, "security_level", "medium");

  // 仅 HTTPS
  await setZoneSetting(zoneId, "always_use_https", "on");

  await upsertCustomWafRule(zoneId);

  console.log("\n完成。建议随后在 Dashboard 确认：");
  console.log("  Security → Bots → Bot Fight Mode = On");
  console.log("  Security → WAF → Custom rules");
  console.log("  Security → Events — 观察误拦后微调");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
