#!/usr/bin/env node
/**
 * 紧急解除 Cloudflare 误拦（需带 WAF 写权限的 API Token 或 Global API Key）
 *
 * 用法：
 *   $env:CLOUDFLARE_API_TOKEN="token"
 *   node scripts/cloudflare-emergency-unblock.mjs
 *
 * 或：
 *   $env:CLOUDFLARE_API_EMAIL="you@example.com"
 *   $env:CLOUDFLARE_API_KEY="global-api-key"
 *   node scripts/cloudflare-emergency-unblock.mjs
 */

import fs from "node:fs";

const ZONE_NAME = "identityinsight.org";
const API = "https://api.cloudflare.com/client/v4";

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

function getAuthHeaders() {
  const email = process.env.CLOUDFLARE_API_EMAIL?.trim();
  const globalKey = process.env.CLOUDFLARE_API_KEY?.trim();
  if (email && globalKey) {
    return { "X-Auth-Email": email, "X-Auth-Key": globalKey };
  }
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim() || readWranglerOAuthToken();
  if (token) return { Authorization: `Bearer ${token}` };
  return null;
}

async function cf(path, init = {}) {
  const authHeaders = getAuthHeaders();
  if (!authHeaders) throw new Error("缺少 CLOUDFLARE_API_TOKEN 或 CLOUDFLARE_API_EMAIL + CLOUDFLARE_API_KEY");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...authHeaders, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const data = await res.json();
  if (!data.success) {
    const err = new Error(JSON.stringify(data.errors || data, null, 2));
    err.status = res.status;
    throw err;
  }
  return data.result;
}

async function main() {
  console.log(`紧急解除 Cloudflare Challenge — ${ZONE_NAME}\n`);

  const zones = await cf(`/zones?name=${ZONE_NAME}`);
  const zoneId = zones.find((z) => z.name === ZONE_NAME)?.id;
  if (!zoneId) throw new Error("找不到 zone");
  console.log(`Zone ID: ${zoneId}\n`);

  for (const [id, value] of [
    ["security_level", "low"],
    ["browser_check", "off"],
  ]) {
    console.log(`→ ${id} = ${JSON.stringify(value)}`);
    await cf(`/zones/${zoneId}/settings/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ value }),
    });
  }

  const ruleset = await cf(`/zones/${zoneId}/rulesets/phases/http_request_firewall_custom/entrypoint`);
  const rules = (ruleset.rules || []).filter((r) => {
    const drop =
      r.ref === "challenge_non_mobile_ua" ||
      r.description === "Challenge non-mobile User-Agent" ||
      (r.action === "managed_challenge" &&
        r.expression?.includes("not http.user_agent contains") &&
        r.expression?.includes("Mobile"));
    if (drop) console.log(`→ 删除规则: ${r.description}`);
    return !drop;
  });

  await cf(`/zones/${zoneId}/rulesets/${ruleset.id}`, {
    method: "PUT",
    body: JSON.stringify({
      name: ruleset.name,
      description: ruleset.description,
      rules,
    }),
  });

  console.log("\n✅ 已降低安全级别并删除「非移动端 Challenge」规则");
  console.log("等待 1–2 分钟后访问 https://identityinsight.org/us/list 验证");
}

main().catch((err) => {
  console.error("\n失败:", err.message || err);
  console.error(`
Wrangler OAuth 无 WAF 写权限。请任选其一：

【方式 A】API Token（推荐）
  1. https://dash.cloudflare.com/profile/api-tokens → Create Custom Token
  2. 权限：Zone WAF Edit、Zone Settings Edit、Config Rules Edit、Zone Read
  3. Zone：identityinsight.org
  4. $env:CLOUDFLARE_API_TOKEN="token"
     node scripts/cloudflare-emergency-unblock.mjs

【方式 B】Dashboard 手动（约 2 分钟）
  1. Security → Security rules → Custom rules
     → 删除或禁用「Challenge non-mobile User-Agent」
  2. Security → Settings → Security Level → Low
  3. Security → Bots → Super Bot Fight Mode
     → Verified bots = Allow
     → Definitely automated = Managed Challenge（勿选 Block）
  4. 保存后等 1–2 分钟再访问网站
`);
  process.exit(1);
});
