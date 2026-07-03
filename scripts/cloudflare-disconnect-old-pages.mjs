#!/usr/bin/env node
/**
 * 从旧账户解除 apk-house Pages 项目（释放 GitHub 仓库供新账户绑定）
 * 用法: node scripts/cloudflare-disconnect-old-pages.mjs [--dry-run]
 */

import fs from "node:fs";

const OLD_ACCOUNT = "0e70af17109f26d0d034bab33006f59e";
const PAGES_PROJECT = "apk-house";
const dryRun = process.argv.includes("--dry-run");
const API = "https://api.cloudflare.com/client/v4";

function readToken() {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const text = fs.readFileSync(`${home}/AppData/Roaming/xdg.config/.wrangler/config/default.toml`, "utf8");
  return text.match(/^oauth_token\s*=\s*"([^"]+)"/m)[1];
}

async function cf(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${readToken()}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const data = await res.json();
  if (!data.success) throw new Error(JSON.stringify(data.errors, null, 2));
  return data.result;
}

async function main() {
  console.log(`删除旧账户 Pages 项目 ${PAGES_PROJECT}${dryRun ? " (dry-run)" : ""}`);
  if (dryRun) return;
  await cf(`/accounts/${OLD_ACCOUNT}/pages/projects/${PAGES_PROJECT}`, { method: "DELETE" });
  console.log("已删除，GitHub 仓库已释放。");
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
