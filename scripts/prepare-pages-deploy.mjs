#!/usr/bin/env node
/**
 * 准备 Cloudflare Pages 上传目录（排除 data/scripts/secrets 等，避免 >25MiB 文件）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, ".pages-dist");

const SKIP_DIRS = new Set([
  ".git",
  ".idea",
  ".agent",
  ".wrangler",
  ".pages-dist",
  "node_modules",
  "data",
  "scripts",
  "secrets",
  "dist-no-bundle",
  "worker",
]);

const SKIP_FILES = new Set([
  "package.json",
  "package-lock.json",
  "wrangler.toml",
  "wrangler.worker.toml",
  ".wranglerignore",
  ".assetsignore",
  // Pages 仅托管静态 HTML；identityinsight.org 由 wrangler.worker.toml 的 Zone Worker 处理
  "_worker.js",
]);

function shouldSkip(relPath, isDir) {
  const parts = relPath.split(/[/\\]/).filter(Boolean);
  if (parts.some((p) => SKIP_DIRS.has(p))) {
    return true;
  }
  if (!isDir && SKIP_FILES.has(parts[parts.length - 1])) {
    return true;
  }
  if (!isDir && /\.log$/i.test(parts[parts.length - 1] || "")) {
    return true;
  }
  return false;
}

function copyTree(srcDir, destDir, rel = "") {
  for (const name of fs.readdirSync(srcDir)) {
    const relPath = rel ? `${rel}/${name}` : name;
    if (shouldSkip(relPath, false)) {
      continue;
    }
    const src = path.join(srcDir, name);
    const dest = path.join(destDir, name);
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      if (shouldSkip(relPath, true)) {
        continue;
      }
      fs.mkdirSync(dest, { recursive: true });
      copyTree(src, dest, relPath);
      continue;
    }
    if (stat.size > 25 * 1024 * 1024) {
      console.warn("[pages-deploy] skip >25MiB:", relPath);
      continue;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

if (fs.existsSync(OUT)) {
  fs.rmSync(OUT, { recursive: true, force: true });
}
fs.mkdirSync(OUT, { recursive: true });
copyTree(ROOT, OUT);
console.log("[pages-deploy] ready:", OUT);
