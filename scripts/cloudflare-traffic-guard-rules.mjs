#!/usr/bin/env node
/**
 * WAF 流量清洗规则 2 / 3：
 *   2. 匿名器 + 开放代理 → Managed Challenge（需 Enterprise Managed IP Lists）
 *   3. 非移动端 UA → Managed Challenge
 *
 * 所需权限：Zone WAF Edit + Zone Read
 *
 * 用法（API Token）：
 *   $env:CLOUDFLARE_API_TOKEN="你的token"
 *   node scripts/cloudflare-traffic-guard-rules.mjs
 *
 * 用法（Global API Key + 账号邮箱）：
 *   $env:CLOUDFLARE_API_EMAIL="you@example.com"
 *   $env:CLOUDFLARE_API_KEY="你的global-api-key"
 *   node scripts/cloudflare-traffic-guard-rules.mjs
 *
 *  dry-run：node scripts/cloudflare-traffic-guard-rules.mjs --dry-run
 */

import fs from "node:fs";

const ZONE_NAME = "identityinsight.org";
const dryRun = process.argv.includes("--dry-run");
const API = "https://api.cloudflare.com/client/v4";

const TRAFFIC_RULES = [
  {
    ref: "challenge_anonymizer_proxy",
    description: "Challenge anonymizers and open proxies (Managed IP Lists)",
    expression:
      "(ip.src in $cf.anonymizer) or (ip.src in $cf.open_proxies)",
    action: "managed_challenge",
  },
  {
    ref: "challenge_non_mobile_ua",
    description: "Challenge non-mobile User-Agent",
    expression: [
      '(not http.user_agent contains "Mobile")',
      'and (not http.user_agent contains "Android")',
      'and (not http.user_agent contains "iPhone")',
      "and (not cf.client.bot)",
    ].join(" "),
    action: "managed_challenge",
  },
];

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
    } catch {
      // continue
    }
  }
  return null;
}

function getAuthHeaders() {
  const email = process.env.CLOUDFLARE_API_EMAIL?.trim();
  const globalKey = process.env.CLOUDFLARE_API_KEY?.trim();
  if (email && globalKey) {
    return {
      "X-Auth-Email": email,
      "X-Auth-Key": globalKey,
    };
  }

  const token =
    process.env.CLOUDFLARE_API_TOKEN?.trim() ||
    readWranglerOAuthToken() ||
    null;
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }

  return null;
}

async function cf(path, init = {}) {
  const authHeaders = getAuthHeaders();
  if (!authHeaders) {
    throw new Error(
      "缺少凭证。请设置 CLOUDFLARE_API_TOKEN，或 CLOUDFLARE_API_EMAIL + CLOUDFLARE_API_KEY"
    );
  }

  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...authHeaders,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const data = await res.json();
  if (!data.success) {
    const err = new Error(JSON.stringify(data.errors || data, null, 2));
    err.status = res.status;
    err.code = data.errors?.[0]?.code;
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

async function upsertTrafficRules(zoneId) {
  let ruleset;
  try {
    ruleset = await cf(
      `/zones/${zoneId}/rulesets/phases/http_request_firewall_custom/entrypoint`
    );
  } catch (e) {
    const missing = e.code === 10003 || String(e.message).includes("10003");
    if (!missing) throw e;
    console.log("→ http_request_firewall_custom: 创建 entrypoint ruleset");
    if (dryRun) return;
    ruleset = await cf(`/zones/${zoneId}/rulesets`, {
      method: "POST",
      body: JSON.stringify({
        name: "default",
        kind: "zone",
        phase: "http_request_firewall_custom",
        rules: [],
      }),
    });
  }

  let rules = [...(ruleset.rules || [])];

  for (const descriptor of TRAFFIC_RULES) {
    const idx = rules.findIndex(
      (r) => r.ref === descriptor.ref || r.description === descriptor.description
    );
    const rule = { ...descriptor, enabled: true, logging: { enabled: true } };

    if (idx >= 0) {
      const prev = rules[idx];
      const { ref: _drop, ...rest } = rule;
      rules[idx] = { ...prev, ...rest };
      console.log(`→ 更新 "${descriptor.description}"`);
    } else {
      rules.push(rule);
      console.log(`→ 新增 "${descriptor.description}"`);
    }
    console.log(`   expression: ${descriptor.expression}`);
    console.log(`   action: ${descriptor.action}`);
  }

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
  console.log(
    `Cloudflare 流量清洗规则 2/3 — ${ZONE_NAME}${dryRun ? " (dry-run)" : ""}\n`
  );

  const zoneId = await getZoneId();
  console.log(`Zone ID: ${zoneId}\n`);

  await upsertTrafficRules(zoneId);

  console.log("\n✅ 规则已提交（传播通常 1–2 分钟）");
  console.log("\nDashboard 确认：Security → WAF → Custom rules");
  console.log("  规则 2: Challenge anonymizers and open proxies");
  console.log("  规则 3: Challenge non-mobile User-Agent");
  console.log("\n注意：规则 2 使用 $cf.anonymizer / $cf.open_proxies 托管 IP 列表，");
  console.log("      需 Enterprise + WAF；Pro 套餐 API 可能返回表达式错误。");
  console.log("      规则 3 在 Pro 可用；已排除 cf.client.bot 以保护 SEO 爬虫。");
}

main().catch((err) => {
  console.error("\n失败:", err.message || err);
  if (
    err.status === 403 ||
    err.code === 9109 ||
    String(err.message).includes("Authentication") ||
    String(err.message).includes("Unauthorized")
  ) {
    console.error(`
需要带 WAF 写入权限的凭证：
  方式 A — API Token（推荐）：
     $env:CLOUDFLARE_API_TOKEN="你的token"
  方式 B — Global API Key：
     $env:CLOUDFLARE_API_EMAIL="你的Cloudflare账号邮箱"
     $env:CLOUDFLARE_API_KEY="你的global-api-key"
  然后运行：node scripts/cloudflare-traffic-guard-rules.mjs
`);
  }
  process.exit(1);
});
