#!/usr/bin/env node
/**
 * WAF 流量清洗规则 2 / 3
 *
 * Pro（默认）：
 *   规则 2 替代：可疑脚本 UA → Managed Challenge（无法使用托管 IP 列表）
 *
 * Enterprise（--enterprise）：
 *   规则 2：$cf.anonymizer + $cf.open_proxies → Managed Challenge
 *
 * 注意：「非移动端 UA → Challenge」会误杀全部桌面用户，已默认关闭。
 * 若确需启用：--challenge-non-mobile（不推荐）
 *
 * 所需权限：Zone WAF Edit + Zone Read
 *
 * 用法：
 *   node scripts/cloudflare-traffic-guard-rules.mjs          # Pro 默认
 *   node scripts/cloudflare-traffic-guard-rules.mjs --enterprise
 *   node scripts/cloudflare-traffic-guard-rules.mjs --dry-run
 */

import fs from "node:fs";

const ZONE_NAME = "identityinsight.org";
const dryRun = process.argv.includes("--dry-run");
const enterprise = process.argv.includes("--enterprise");
const challengeNonMobile = process.argv.includes("--challenge-non-mobile");
const API = "https://api.cloudflare.com/client/v4";

const RULE_ENTERPRISE_ANONYMIZER = {
  ref: "challenge_anonymizer_proxy",
  description: "Challenge anonymizers and open proxies (Managed IP Lists)",
  expression:
    "(ip.src in $cf.anonymizer) or (ip.src in $cf.open_proxies)",
  action: "managed_challenge",
};

const RULE_PRO_SCRIPT_UA = {
  ref: "challenge_suspicious_script_ua",
  description: "Challenge suspicious script User-Agents (Pro fallback for rule 2)",
  expression: [
    "(not cf.client.bot)",
    'and (http.user_agent contains "curl"',
    'or http.user_agent contains "python-requests"',
    'or http.user_agent contains "Go-http-client"',
    'or http.user_agent contains "HeadlessChrome"',
    'or http.user_agent contains "PhantomJS"',
    'or http.user_agent contains "scrapy"',
    'or http.user_agent eq "")',
  ].join(" "),
  action: "managed_challenge",
};

const RULE_NON_MOBILE = {
  ref: "challenge_non_mobile_ua",
  description: "Challenge non-mobile User-Agent",
  expression: [
    '(not http.user_agent contains "Mobile")',
    'and (not http.user_agent contains "Android")',
    'and (not http.user_agent contains "iPhone")',
    "and (not cf.client.bot)",
  ].join(" "),
  action: "managed_challenge",
};

const ENTERPRISE_ONLY_REFS = new Set(["challenge_anonymizer_proxy"]);
const PRO_FALLBACK_REFS = new Set(["challenge_suspicious_script_ua"]);

function buildTrafficRules() {
  const rules = enterprise ? [RULE_ENTERPRISE_ANONYMIZER] : [RULE_PRO_SCRIPT_UA];
  if (challengeNonMobile) rules.push(RULE_NON_MOBILE);
  return rules;
}

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

function pruneIncompatibleRules(rules) {
  const keepRefs = new Set(buildTrafficRules().map((r) => r.ref));
  return rules.filter((r) => {
    if (r.ref === "challenge_non_mobile_ua" && !challengeNonMobile) {
      console.log(`→ 移除误杀规则: ${r.description}`);
      return false;
    }
    if (enterprise) {
      return !PRO_FALLBACK_REFS.has(r.ref);
    }
    if (ENTERPRISE_ONLY_REFS.has(r.ref) && !keepRefs.has(r.ref)) {
      console.log(`→ 移除 Enterprise 专属规则（Pro 不可用）: ${r.description}`);
      return false;
    }
    return true;
  });
}

async function upsertTrafficRules(zoneId) {
  const trafficRules = buildTrafficRules();

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

  let rules = pruneIncompatibleRules([...(ruleset.rules || [])]);

  for (const descriptor of trafficRules) {
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
  const mode = enterprise ? "Enterprise" : "Pro";
  console.log(
    `Cloudflare 流量清洗规则 2/3 (${mode}) — ${ZONE_NAME}${dryRun ? " (dry-run)" : ""}\n`
  );

  const zoneId = await getZoneId();
  console.log(`Zone ID: ${zoneId}\n`);

  await upsertTrafficRules(zoneId);

  console.log("\n✅ 规则已提交（传播通常 1–2 分钟）");
  console.log("\nDashboard：Security → 安全规则 → 自定义规则");

  if (enterprise) {
    console.log("  规则 2: Challenge anonymizers and open proxies");
  } else {
    console.log("  规则 2 (Pro 替代): Challenge suspicious script User-Agents");
    console.log("\nPro 无法使用 $cf.anonymizer / $cf.open_proxies（需 Enterprise）。");
    console.log("Tor/VPN 部分覆盖请配合 Dashboard → Bots → Super Bot Fight Mode：");
    console.log("  Likely automated → Managed Challenge");
    console.log("  Definitely automated → Block");
  }
  if (!challengeNonMobile) {
    console.log("\n已跳过「非移动端 UA Challenge」（会误杀全部桌面用户）。");
  }
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
  $env:CLOUDFLARE_API_TOKEN="你的token"
  npm run cf:traffic-guard
`);
  }
  if (String(err.message).includes("cf.open_proxies") || String(err.message).includes("cf.anonymizer")) {
    console.error(`
这是 Enterprise 专属能力。Pro 请不要手动写托管 IP 列表表达式，直接运行：
  npm run cf:traffic-guard
`);
  }
  process.exit(1);
});
