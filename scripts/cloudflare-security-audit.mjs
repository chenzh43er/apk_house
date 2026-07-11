#!/usr/bin/env node
/**
 * 查看 identityinsight.org 当前 Cloudflare 安全规则与 URL 探测结果。
 *
 * 用法：node scripts/cloudflare-security-audit.mjs
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
    return { "X-Auth-Email": email, "X-Auth-Key": globalKey };
  }
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim() || readWranglerOAuthToken();
  if (token) return { Authorization: `Bearer ${token}` };
  return null;
}

async function cf(path) {
  const authHeaders = getAuthHeaders();
  if (!authHeaders) throw new Error("No auth credentials");
  const res = await fetch(`${API}${path}`, { headers: authHeaders });
  const data = await res.json();
  if (!data.success) throw new Error(JSON.stringify(data.errors || data, null, 2));
  return data.result;
}

const zones = await cf(`/zones?name=${ZONE_NAME}`);
const zoneId = zones.find((z) => z.name === ZONE_NAME)?.id;
console.log(`Zone: ${ZONE_NAME} (${zoneId})\n`);

console.log("=== Zone Settings ===");
for (const s of ["security_level", "browser_check", "bot_fight_mode", "challenge_ttl", "always_use_https"]) {
  try {
    const r = await cf(`/zones/${zoneId}/settings/${s}`);
    console.log(`  ${s}: ${JSON.stringify(r.value)}`);
  } catch (e) {
    console.log(`  ${s}: ERROR - ${e.message}`);
  }
}

const phases = [
  "http_request_firewall_custom",
  "http_config_settings",
  "http_request_firewall_managed",
];

for (const phase of phases) {
  console.log(`\n=== ${phase} ===`);
  try {
    const rs = await cf(`/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`);
    const rules = rs.rules || [];
    console.log(`  Ruleset: ${rs.id} (${rules.length} rules)`);
    for (const [i, r] of rules.entries()) {
      console.log(`\n  [${i + 1}] ${r.enabled ? "ON" : "OFF"} | ${r.action} | ${r.description || r.ref || "(no desc)"}`);
      if (r.ref) console.log(`      ref: ${r.ref}`);
      if (r.expression) console.log(`      expr: ${r.expression}`);
      if (r.action_parameters) {
        console.log(`      params: ${JSON.stringify(r.action_parameters)}`);
      }
    }
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
  }
}

console.log("\n=== Quick URL tests ===");
const tests = [
  { name: "ads.txt", url: `https://${ZONE_NAME}/ads.txt` },
  { name: "us/list HTML", url: `https://${ZONE_NAME}/us/list` },
  { name: "us/form HTML", url: `https://${ZONE_NAME}/us/form` },
  { name: "static CSS", url: `https://${ZONE_NAME}/Public/Css/layout-shell.css` },
  { name: "Googlebot form", url: `https://${ZONE_NAME}/us/form`, ua: "Mozilla/5.0 (compatible; Googlebot/2.1)" },
  {
    name: "iPhone Safari",
    url: `https://${ZONE_NAME}/us/list`,
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  },
  {
    name: "微信 WebView（无 Sec-Fetch）",
    url: `https://${ZONE_NAME}/us/list`,
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.49 NetType/WIFI Language/zh_CN",
  },
  {
    name: "Android Chrome",
    url: `https://${ZONE_NAME}/us/list`,
    ua: "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  },
];
for (const t of tests) {
  try {
    const res = await fetch(t.url, {
      redirect: "manual",
      headers: {
        "User-Agent": t.ua || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/136.0.0.0",
      },
    });
    const mitigated = res.headers.get("cf-mitigated") || "";
    console.log(`  ${t.name}: HTTP ${res.status}${mitigated ? ` [${mitigated}]` : ""}`);
  } catch (e) {
    console.log(`  ${t.name}: FAIL ${e.message}`);
  }
}
