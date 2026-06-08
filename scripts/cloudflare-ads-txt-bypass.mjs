#!/usr/bin/env node
/**
 * Super Bot Fight Mode (Pro/Business) 无法完全关闭时的 ads.txt 放行方案。
 *
 * 原因：SBFM 的「静态资源保护」会保护 .txt 文件（含 ads.txt / robots.txt）。
 * 解决：WAF Skip 规则跳过 SBFM 阶段 + Configuration Rule 降低 BIC。
 *
 * 所需权限：Zone WAF Edit + Config Rules Edit + Zone Read
 * （不需要 Zone Settings Edit，无需关闭 SBFM）
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
      "缺少 CLOUDFLARE_API_TOKEN。请创建 Token（Zone WAF:Edit + Config Rules:Edit + Zone:Read）"
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
  console.log(
    `SBFM ads.txt 放行 — ${ZONE_NAME}${dryRun ? " (dry-run)" : ""}\n`
  );
  console.log(
    "说明：Super Bot Fight Mode 在 Pro/Business 套餐无法完全关闭，"
  );
  console.log("      通过 WAF Skip 跳过 SBFM 阶段来放行 ads.txt。\n");

  const zoneId = await getZoneId();
  console.log(`Zone ID: ${zoneId}\n`);

  await upsertPhaseRule(zoneId, "http_request_firewall_custom", {
    ref: "ads_txt_bypass_skip",
    description: "Skip SBFM for ads.txt, robots.txt, verified bots",
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
  console.log("\n若仍 403，请在 Dashboard 额外操作：");
  console.log("  Security → Settings → Super Bot Fight Mode");
  console.log("  → Static resource protection = Off");
  console.log("  → Verified bots = Allow");
}

main().catch((err) => {
  console.error("\n失败:", err.message || err);
  if (
    err.status === 403 ||
    String(err.message).includes("Authentication") ||
    String(err.message).includes("Unauthorized")
  ) {
    console.error(`
需要 API Token（只需 WAF + Config Rules 权限，无需关闭 SBFM）：
  1. https://dash.cloudflare.com/profile/api-tokens → Create Token
  2. 权限：Zone WAF Edit、Config Rules Edit、Zone Read
  3. 运行：
     $env:CLOUDFLARE_API_TOKEN="你的token"
     node scripts/cloudflare-ads-txt-bypass.mjs
`);
  }
  process.exit(1);
});
