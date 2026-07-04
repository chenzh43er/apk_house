#!/usr/bin/env node
/**
 * 跨账户 R2 桶迁移：Chjgfjjyghjhggg → Ubeator
 * 使用 Cloudflare REST API + R2 API Token（推荐）或 Wrangler OAuth
 *
 * 用法：
 *   node scripts/cloudflare-r2-migrate.mjs
 *   node scripts/cloudflare-r2-migrate.mjs --bucket houseus
 *   node scripts/cloudflare-r2-migrate.mjs --concurrency 2
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authHeadersForAccount, ensureAuthReady, refreshOAuthToken, usingR2ApiTokens } from "./cloudflare-auth.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(__dirname, "../data/r2-migrate-cache");

const BUCKETS = ["houseus", "housepic", "houseat", "housech"];
const SRC_ACCOUNT = process.env.R2_SRC_ACCOUNT_ID || "0e70af17109f26d0d034bab33006f59e";
const DST_ACCOUNT = process.env.R2_DST_ACCOUNT_ID || "892acd09257ee1251aca55e5a6f9946e";
const API = "https://api.cloudflare.com/client/v4";

const dryRun = process.argv.includes("--dry-run");
const bucketArg =
  process.argv.find((a) => a.startsWith("--bucket="))?.split("=")[1] ||
  (process.argv.includes("--bucket") ? process.argv[process.argv.indexOf("--bucket") + 1] : null);
const concurrencyArg =
  process.argv.find((a) => a.startsWith("--concurrency="))?.split("=")[1] ||
  (process.argv.includes("--concurrency") ? process.argv[process.argv.indexOf("--concurrency") + 1] : "2");

const buckets = bucketArg ? [bucketArg] : BUCKETS;
const concurrency = Math.max(1, Number.parseInt(concurrencyArg, 10) || 2);
const DELAY_MS = Number.parseInt(process.env.R2_MIGRATE_DELAY_MS || "150", 10);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function objectUrl(accountId, bucket, key) {
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  return `${API}/accounts/${accountId}/r2/buckets/${bucket}/objects/${encoded}`;
}

async function fetchWithRetry(url, init = {}, label = "request", accountId = DST_ACCOUNT) {
  const maxRetries = 8;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: authHeadersForAccount(accountId, init.headers || {}),
      });

      if (res.status === 401 && !usingR2ApiTokens() && attempt < maxRetries) {
        try {
          await refreshOAuthToken(true);
          console.warn(`  [${label}] HTTP 401，已通过 refresh_token 刷新 OAuth 后重试 (${attempt + 1}/${maxRetries})`);
        } catch (err) {
          console.warn(`  [${label}] HTTP 401，OAuth 刷新失败: ${err.message}`);
          throw err;
        }
        await sleep(1000);
        continue;
      }

      if (res.status === 429 || res.status >= 500) {
        const wait = Math.min(60_000, 1000 * 2 ** attempt);
        console.warn(`  [${label}] HTTP ${res.status}，${wait}ms 后重试 (${attempt + 1}/${maxRetries})`);
        await sleep(wait);
        continue;
      }

      return res;
    } catch (err) {
      const wait = Math.min(60_000, 1000 * 2 ** attempt);
      console.warn(`  [${label}] ${err.message}，${wait}ms 后重试 (${attempt + 1}/${maxRetries})`);
      await sleep(wait);
    }
  }
  throw new Error(`${label} failed after retries`);
}

function cachePath(bucket) {
  return path.join(CACHE_DIR, `${bucket}.json`);
}

function loadDestCache(bucket) {
  try {
    const data = JSON.parse(fs.readFileSync(cachePath(bucket), "utf8"));
    if (data.account !== DST_ACCOUNT) return null;
    return new Map(Object.entries(data.keys || {}));
  } catch {
    return null;
  }
}

function saveDestCache(bucket, index) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(
    cachePath(bucket),
    JSON.stringify({ account: DST_ACCOUNT, keys: Object.fromEntries(index), updated: new Date().toISOString() })
  );
}

async function parseJson(res, label) {
  const text = await res.text();
  if (!text.trim()) throw new Error(`${label}: empty response (HTTP ${res.status})`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label}: invalid JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
}

async function listPage(accountId, bucket, cursor) {
  const url = new URL(`${API}/accounts/${accountId}/r2/buckets/${bucket}/objects`);
  url.searchParams.set("limit", "1000");
  if (cursor) url.searchParams.set("cursor", cursor);

  const res = await fetchWithRetry(url, { headers: {} }, `list ${bucket}`, accountId);
  const data = await parseJson(res, `list ${bucket}`);
  if (!data.success) throw new Error(JSON.stringify(data.errors, null, 2));

  await sleep(DELAY_MS);
  return {
    objects: data.result || [],
    cursor: data.result_info?.is_truncated ? data.result_info.cursor : null,
  };
}

async function buildDestIndex(bucket) {
  const cached = loadDestCache(bucket);
  if (cached && cached.size > 0) {
    console.log(`  从本地缓存加载目标索引 (${cached.size} 个对象)`);
    return cached;
  }

  console.log(`  构建目标索引...`);
  const index = new Map();
  let cursor;
  let pages = 0;

  do {
    const page = await listPage(DST_ACCOUNT, bucket, cursor);
    pages++;
    for (const obj of page.objects) {
      index.set(obj.key, obj.etag);
    }
    if (pages % 10 === 0) console.log(`  索引构建中... ${index.size} 个对象 (${pages} 页)`);
    cursor = page.cursor;
  } while (cursor);

  console.log(`  目标已有 ${index.size} 个对象 (${pages} 页)`);
  saveDestCache(bucket, index);
  return index;
}

async function copyObject(bucket, obj) {
  const { key, http_metadata: meta } = obj;
  const contentType = meta?.contentType || "application/octet-stream";

  const getRes = await fetchWithRetry(
    objectUrl(SRC_ACCOUNT, bucket, key),
    { headers: {} },
    `GET ${key}`,
    SRC_ACCOUNT
  );
  if (!getRes.ok) throw new Error(`GET ${key} failed: ${getRes.status}`);

  const body = await getRes.arrayBuffer();
  await sleep(DELAY_MS);

  const putRes = await fetchWithRetry(
    objectUrl(DST_ACCOUNT, bucket, key),
    {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body,
    },
    `PUT ${key}`,
    DST_ACCOUNT
  );

  if (!putRes.ok) {
    const err = await putRes.text();
    throw new Error(`PUT ${key} failed: ${putRes.status} ${err}`);
  }

  await sleep(DELAY_MS);
}

async function runPool(items, worker) {
  let index = 0;
  async function next() {
    while (index < items.length) {
      const i = index++;
      await worker(items[i]);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => next()));
}

async function migrateBucket(bucket) {
  console.log(`\n=== ${bucket} ===`);
  const destIndex = dryRun ? new Map() : await buildDestIndex(bucket);

  let cursor;
  let copied = 0;
  let skipped = 0;
  let failed = 0;
  const failedKeys = [];
  let pageNum = 0;

  do {
    const page = await listPage(SRC_ACCOUNT, bucket, cursor);
    pageNum++;
    console.log(`  第 ${pageNum} 页: ${page.objects.length} 个对象`);

    if (dryRun) {
      for (const obj of page.objects) {
        console.log(`    [dry-run] ${obj.key}`);
      }
      cursor = page.cursor;
      continue;
    }

    const todo = page.objects.filter((obj) => {
      if (destIndex.get(obj.key) === obj.etag) {
        skipped++;
        return false;
      }
      return true;
    });

    if (todo.length === 0) {
      cursor = page.cursor;
      continue;
    }

    await runPool(todo, async (obj) => {
      try {
        await copyObject(bucket, obj);
        destIndex.set(obj.key, obj.etag);
        copied++;
        if (copied % 50 === 0) {
          saveDestCache(bucket, destIndex);
          console.log(`  已复制 ${copied}，跳过 ${skipped}...`);
        }
      } catch (err) {
        failed++;
        failedKeys.push({ obj, err: err.message });
        console.error(`  失败 ${obj.key}: ${err.message}`);
      }
    });

    cursor = page.cursor;
  } while (cursor);

  if (failedKeys.length > 0) {
    console.log(`  重试 ${failedKeys.length} 个失败对象...`);
    for (const { obj } of failedKeys) {
      if (destIndex.get(obj.key) === obj.etag) {
        skipped++;
        failed--;
        continue;
      }
      try {
        await copyObject(bucket, obj);
        destIndex.set(obj.key, obj.etag);
        copied++;
        failed--;
      } catch (err) {
        console.error(`  重试仍失败 ${obj.key}: ${err.message}`);
      }
    }
  }

  if (!dryRun) {
    saveDestCache(bucket, destIndex);
    console.log(`  完成: 复制 ${copied}，跳过 ${skipped}，失败 ${failed}`);
  }

  return { copied, skipped, failed };
}

async function main() {
  await ensureAuthReady();
  console.log(
    `R2 迁移 ${SRC_ACCOUNT} → ${DST_ACCOUNT}${dryRun ? " (dry-run)" : ""}\n` +
      `并发 ${concurrency}，请求间隔 ${DELAY_MS}ms` +
      (usingR2ApiTokens()
        ? "，使用 R2 API Token（源 + 目标）"
        : process.env.CLOUDFLARE_API_TOKEN
          ? "，使用 CLOUDFLARE_API_TOKEN"
          : "，使用 Wrangler OAuth")
  );

  const totals = { copied: 0, skipped: 0, failed: 0 };
  for (const bucket of buckets) {
    const r = await migrateBucket(bucket);
    if (r) {
      totals.copied += r.copied;
      totals.skipped += r.skipped;
      totals.failed += r.failed;
    }
  }

  console.log(`\nR2 迁移完成。总计: 复制 ${totals.copied}，跳过 ${totals.skipped}，失败 ${totals.failed}`);
  if (totals.failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
