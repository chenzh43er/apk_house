#!/usr/bin/env node
/**
 * 将 apk_house 从旧账户迁移到 Ubeator@foxmail.com 账户：
 *  - 创建 Pages 项目并连接 GitHub
 *  - 部署 houseworker 并绑定 identityinsight.org
 *  - 绑定 Pages 自定义域名
 *
 * R2 数据迁移请单独运行：node scripts/cloudflare-r2-migrate.mjs
 *
 * 用法：
 *   node scripts/cloudflare-migrate-to-ubeator.mjs --dry-run
 *   node scripts/cloudflare-migrate-to-ubeator.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const OLD_ACCOUNT = "0e70af17109f26d0d034bab33006f59e";
const NEW_ACCOUNT = "892acd09257ee1251aca55e5a6f9946e";
const ZONE_NAME = "identityinsight.org";
const ZONE_ID = "81e776394b2a74be0ba0283e37dadf5b";
const WORKER_NAME = "houseworker";
const PAGES_PROJECT = "apk-house";
const GITHUB_OWNER = "chenzh43er";
const GITHUB_REPO = "apk_house";
const PRODUCTION_BRANCH = "master";
const DOMAIN = "identityinsight.org";

const dryRun = process.argv.includes("--dry-run");
const API = "https://api.cloudflare.com/client/v4";

function readWranglerOAuthToken() {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const configPath = `${home}/AppData/Roaming/xdg.config/.wrangler/config/default.toml`;
  const text = fs.readFileSync(configPath, "utf8");
  const match = text.match(/^oauth_token\s*=\s*"([^"]+)"/m);
  if (!match) throw new Error("缺少 Wrangler OAuth token");
  return match[1];
}

async function cf(apiPath, init = {}) {
  const token = readWranglerOAuthToken();
  const res = await fetch(`${API}${apiPath}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(JSON.stringify(data.errors || data, null, 2));
  }
  return data.result;
}

async function ensurePagesProject() {
  let projects;
  try {
    projects = await cf(`/accounts/${NEW_ACCOUNT}/pages/projects`);
  } catch {
    projects = [];
  }

  const existing = projects?.find((p) => p.name === PAGES_PROJECT);
  if (existing) {
    console.log(`→ Pages 项目 ${PAGES_PROJECT} 已存在`);
    return existing;
  }

  console.log(`→ 创建 Pages 项目 ${PAGES_PROJECT}（GitHub: ${GITHUB_OWNER}/${GITHUB_REPO}）`);
  if (dryRun) return { name: PAGES_PROJECT };

  return cf(`/accounts/${NEW_ACCOUNT}/pages/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: PAGES_PROJECT,
      production_branch: PRODUCTION_BRANCH,
      build_config: {
        destination_dir: ".",
        build_command: "",
      },
      source: {
        type: "github",
        config: {
          owner: GITHUB_OWNER,
          repo_name: GITHUB_REPO,
          production_branch: PRODUCTION_BRANCH,
          deployments_enabled: true,
          production_deployments_enabled: true,
          preview_deployment_setting: "all",
        },
      },
    }),
  });
}

async function addPagesDomain(projectName, domain) {
  console.log(`→ 绑定 Pages 域名 ${domain}`);
  if (dryRun) return;

  try {
    await cf(`/accounts/${NEW_ACCOUNT}/pages/projects/${projectName}/domains`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: domain }),
    });
  } catch (err) {
    if (String(err.message).includes("already exists") || String(err.message).includes("8000018")) {
      console.log(`  域名 ${domain} 已绑定，跳过`);
      return;
    }
    throw err;
  }
}

async function deployWorker() {
  console.log(`→ 部署 Worker ${WORKER_NAME}（wrangler deploy）`);
  if (dryRun) return;

  const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["wrangler", "deploy", "--config", "wrangler.worker.toml"],
    { cwd: ROOT, stdio: "inherit", shell: true }
  );
  if (result.status !== 0) {
    throw new Error("wrangler deploy 失败");
  }
}

async function ensureWorkerRoutes() {
  const patterns = [
    `${DOMAIN}/*`,
    `www.${DOMAIN}/*`,
  ];

  for (const pattern of patterns) {
    console.log(`→ 绑定 Worker 路由 ${pattern}`);
    if (dryRun) continue;

    try {
      await cf(`/accounts/${NEW_ACCOUNT}/workers/scripts/${WORKER_NAME}/routes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pattern, zone_id: ZONE_ID }),
      });
    } catch (err) {
      const msg = String(err.message);
      if (msg.includes("already exists") || msg.includes("10020")) {
        console.log(`  路由 ${pattern} 已存在，跳过`);
        continue;
      }
      throw err;
    }
  }
}

async function triggerPagesDeploy(projectName) {
  console.log(`→ 触发 Pages 生产部署`);
  if (dryRun) return;

  try {
    await cf(`/accounts/${NEW_ACCOUNT}/pages/projects/${projectName}/deployments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branch: PRODUCTION_BRANCH }),
    });
  } catch (err) {
    console.log(`  部署触发跳过（可能需 Git push 或 Dashboard 手动部署）: ${err.message}`);
  }
}

async function main() {
  console.log(`Cloudflare 迁移 — ${DOMAIN} → Ubeator 账户${dryRun ? " (dry-run)" : ""}\n`);

  await ensurePagesProject();
  // 不要绑 Pages 自定义域：公网入口由 houseworker 路由接管，Pages 仅作内部回源 apk-house.pages.dev
  await deployWorker();
  await ensureWorkerRoutes();
  await triggerPagesDeploy(PAGES_PROJECT);

  console.log("\n完成。后续步骤：");
  console.log("  1. 运行 R2 迁移: node scripts/cloudflare-r2-migrate.mjs");
  console.log("  2. 在 Dashboard 确认 GitHub 已授权 Cloudflare Pages");
  console.log("  3. 若 identityinsight.org 原 idworker 仍占用路由，请在 Dashboard 移除 idworker 自定义域名");
  console.log(`  4. 验证: https://${DOMAIN}/`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
