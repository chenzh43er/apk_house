#!/usr/bin/env node
/**
 * WAF Skip：已验证爬虫 + 静态资源跳过 SBFM / Managed Challenge / BIC。
 *
 * 解决 HTML 页、/cdn/ 图片、Public 静态资源被 Challenge 403 的问题。
 *
 * 所需权限：Zone WAF Edit + Config Rules Edit + Zone Read
 *
 * 用法（API Token）：
 *   $env:CLOUDFLARE_API_TOKEN="你的token"
 *   node scripts/cloudflare-static-bot-bypass.mjs
 *
 * 用法（Global API Key + 账号邮箱）：
 *   $env:CLOUDFLARE_API_EMAIL="you@example.com"
 *   $env:CLOUDFLARE_API_KEY="你的global-api-key"
 *   node scripts/cloudflare-static-bot-bypass.mjs
 */

import fs from "node:fs";
import {
  BROWSER_NAV_EXPR,
  isMobileRequestExpr,
  realUserBypassExpr,
} from "./cloudflare-mobile-expr.mjs";

const ZONE_NAME = "identityinsight.org";
const dryRun = process.argv.includes("--dry-run");
const API = "https://api.cloudflare.com/client/v4";

/** 真实浏览器打开页面（含 iOS Safari / Android Chrome / 应用内 WebView） */
const BROWSER_NAV_BYPASS = BROWSER_NAV_EXPR;

/** 移动端 UA / Client Hints（弥补缺 Sec-Fetch 的应用内浏览器） */
const MOBILE_BYPASS = isMobileRequestExpr();

/** Pro WAF 仅支持 eq / contains（不支持 starts_with / matches） */
const BYPASS_EXPR = [
  "cf.client.bot",
  realUserBypassExpr(),
  '(http.request.uri.path eq "/ads.txt")',
  '(http.request.uri.path eq "/robots.txt")',
  '(http.request.uri.path contains "/Public/")',
  '(http.request.uri.path contains "/cdn/")',
  '(http.request.uri.path contains "/Assets/")',
  '(http.request.uri.path contains ".css")',
  '(http.request.uri.path contains ".js")',
  '(http.request.uri.path contains ".webp")',
  '(http.request.uri.path contains ".png")',
  '(http.request.uri.path contains ".jpg")',
  '(http.request.uri.path contains ".jpeg")',
  '(http.request.uri.path contains ".gif")',
  '(http.request.uri.path contains ".svg")',
  '(http.request.uri.path contains ".ico")',
  '(http.request.uri.path contains ".woff")',
  '(http.request.uri.path contains ".woff2")',
  '(http.request.uri.path contains ".ttf")',
  '(http.request.uri.path contains ".eot")',
  '(http.request.uri.path contains ".map")',
  '(http.request.uri.path contains ".xml")',
].join(" or ");

const STATIC_CONFIG_EXPR = [
  '(http.request.uri.path contains "/Public/")',
  '(http.request.uri.path contains "/cdn/")',
  '(http.request.uri.path contains "/Assets/")',
  '(http.request.uri.path contains ".css")',
  '(http.request.uri.path contains ".js")',
  '(http.request.uri.path contains ".webp")',
  '(http.request.uri.path contains ".png")',
  '(http.request.uri.path contains ".jpg")',
  '(http.request.uri.path contains ".jpeg")',
  '(http.request.uri.path contains ".gif")',
  '(http.request.uri.path contains ".svg")',
  '(http.request.uri.path contains ".ico")',
  '(http.request.uri.path contains ".woff")',
  '(http.request.uri.path contains ".woff2")',
].join(" or ");

const SKIP_PHASES = [
  "http_request_sbfm",
  "http_ratelimit",
  "http_request_firewall_managed",
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

async function upsertPhaseRule(zoneId, phase, descriptor) {
  let ruleset;
  try {
    ruleset = await cf(
      `/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`
    );
  } catch (e) {
    const missing = e.code === 10003 || String(e.message).includes("10003");
    if (!missing) throw e;
    console.log(`→ ${phase}: 创建 entrypoint ruleset`);
    if (dryRun) return;
    ruleset = await cf(`/zones/${zoneId}/rulesets`, {
      method: "POST",
      body: JSON.stringify({
        name: "default",
        kind: "zone",
        phase,
        rules: [],
      }),
    });
  }

  const existing = ruleset.rules || [];
  const idx = existing.findIndex(
    (r) =>
      r.ref === descriptor.ref ||
      r.description === descriptor.description ||
      (phase === "http_request_firewall_custom" &&
        descriptor.ref === "bot_static_bypass_skip" &&
        (r.ref === "ads_txt_bypass_skip" ||
          r.description === "Skip security for ads.txt, robots.txt, verified bots"))
  );

  const rule = { ...descriptor, enabled: true };
  let rules;
  if (idx >= 0) {
    const prev = existing[idx];
    const { ref: _drop, ...rest } = rule;
    rules = existing.map((r, i) => (i === idx ? { ...r, ...rest } : r));
  } else if (phase === "http_request_firewall_custom") {
    rules = [rule, ...existing];
  } else {
    rules = [...existing, rule];
  }

  if (phase === "http_request_firewall_custom") {
    rules = rules.filter(
      (r) =>
        r.description !== "TEST" &&
        r.description !== "TEST starts_with - delete me" &&
        r.ref !== "ads_txt_bypass_skip"
    );
  }

  console.log(
    `→ ${phase} "${descriptor.description}" (${idx >= 0 ? "更新" : "新增"})`
  );
  console.log(`   expression: ${descriptor.expression.slice(0, 120)}${descriptor.expression.length > 120 ? "…" : ""}`);
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

async function verifyUrls() {
  const cases = [
    {
      name: "ads.txt",
      url: `https://${ZONE_NAME}/ads.txt`,
      ua: "Mozilla/5.0 (compatible; AdsFixVerify/1.0)",
      expect: (s) => s === 200,
    },
    {
      name: "Googlebot HTML",
      url: `https://${ZONE_NAME}/us/form`,
      ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      expect: (s) => s === 200 || s === 301 || s === 302,
    },
    {
      name: "静态 CSS",
      url: `https://${ZONE_NAME}/Public/Css/layout-shell.css`,
      ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/136.0.0.0",
      expect: (s) => s === 200,
    },
    {
      name: "iPhone Safari HTML",
      url: `https://${ZONE_NAME}/us/list`,
      ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      headers: {
        Accept: "text/html",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Site": "none",
      },
      expect: (s) => s === 200 || s === 301 || s === 302,
    },
    {
      name: "微信 WebView（无 Sec-Fetch）",
      url: `https://${ZONE_NAME}/us/list`,
      ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.49(0x18003137) NetType/WIFI Language/zh_CN",
      expect: (s) => s === 200 || s === 301 || s === 302,
    },
    {
      name: "Android Client Hints",
      url: `https://${ZONE_NAME}/us/list`,
      ua: "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
      headers: {
        "Sec-CH-UA-Mobile": "?1",
      },
      expect: (s) => s === 200 || s === 301 || s === 302,
    },
    {
      name: "普通用户 HTML（可能仍 Challenge）",
      url: `https://${ZONE_NAME}/us/list`,
      ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/136.0.0.0",
      expect: () => true,
    },
  ];

  console.log("\n验证请求：");
  for (const c of cases) {
    try {
      const res = await fetch(c.url, {
        redirect: "manual",
        headers: { "User-Agent": c.ua, ...(c.headers || {}) },
      });
      const ok = c.expect(res.status);
      const mitigated = res.headers.get("cf-mitigated") || "";
      console.log(
        `  ${ok ? "✅" : "⚠️ "} ${c.name}: HTTP ${res.status}${mitigated ? ` (cf-mitigated: ${mitigated})` : ""}`
      );
    } catch (e) {
      console.log(`  ❌ ${c.name}: ${e.message}`);
    }
  }
}

async function main() {
  console.log(
    `Cloudflare 静态资源 + 爬虫 WAF Skip — ${ZONE_NAME}${dryRun ? " (dry-run)" : ""}\n`
  );

  const zoneId = await getZoneId();
  console.log(`Zone ID: ${zoneId}\n`);

  await upsertPhaseRule(zoneId, "http_request_firewall_custom", {
    ref: "bot_static_bypass_skip",
    description: "Skip SBFM for verified bots, browser navigation, ads.txt, static assets",
    expression: BYPASS_EXPR,
    action: "skip",
    action_parameters: {
      products: ["bic", "securityLevel", "uaBlock"],
      phases: SKIP_PHASES,
      ruleset: "current",
    },
    logging: { enabled: true },
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

  await upsertPhaseRule(zoneId, "http_config_settings", {
    ref: "static_assets_config",
    description: "Low security for Public/cdn/Assets and static extensions",
    expression: STATIC_CONFIG_EXPR,
    action: "set_config",
    action_parameters: {
      bic: false,
      security_level: "essentially_off",
    },
  });

  await upsertPhaseRule(zoneId, "http_config_settings", {
    ref: "browser_nav_low_security",
    description: "Lower security for real browser page loads (mobile/desktop Safari/Chrome)",
    expression: `(${BROWSER_NAV_BYPASS} or ${MOBILE_BYPASS})`,
    action: "set_config",
    action_parameters: {
      bic: false,
      security_level: "low",
    },
  });

  console.log("\n✅ 规则已提交（传播通常 1–2 分钟）");
  console.log("\nDashboard 手动确认：");
  console.log("  Security → Bots → Super Bot Fight Mode");
  console.log("    Verified bots = Allow");
  console.log("    Static resource protection = Off");
  console.log("  Security → WAF → Custom rules → 确认 Skip 规则在顶部");

  if (!dryRun) {
    await verifyUrls();
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
需要带写入权限的凭证：
  方式 A — API Token（推荐）：
     $env:CLOUDFLARE_API_TOKEN="你的token"
  方式 B — Global API Key：
     $env:CLOUDFLARE_API_EMAIL="你的Cloudflare账号邮箱"
     $env:CLOUDFLARE_API_KEY="你的global-api-key"
  然后运行：node scripts/cloudflare-static-bot-bypass.mjs
`);
  }
  process.exit(1);
});
