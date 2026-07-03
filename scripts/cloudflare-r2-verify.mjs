#!/usr/bin/env node
/**
 * 校验 R2 跨账户迁移结果：对比源/目标各桶对象数量与 etag
 *
 * 用法：node scripts/cloudflare-r2-verify.mjs
 */

import fs from "node:fs";

const BUCKETS = ["houseus", "housepic", "houseat", "housech"];
const SRC_ACCOUNT = "0e70af17109f26d0d034bab33006f59e";
const DST_ACCOUNT = "892acd09257ee1251aca55e5a6f9946e";
const API = "https://api.cloudflare.com/client/v4";

function readToken() {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const text = fs.readFileSync(`${home}/AppData/Roaming/xdg.config/.wrangler/config/default.toml`, "utf8");
  const match = text.match(/^oauth_token\s*=\s*"([^"]+)"/m);
  if (!match) throw new Error("缺少 Wrangler OAuth token");
  return match[1];
}

const TOKEN = readToken();

async function listAll(accountId, bucket) {
  const index = new Map();
  let cursor;
  do {
    const url = new URL(`${API}/accounts/${accountId}/r2/buckets/${bucket}/objects`);
    url.searchParams.set("limit", "1000");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const data = await res.json();
    if (!data.success) throw new Error(JSON.stringify(data.errors));

    for (const obj of data.result || []) {
      index.set(obj.key, { etag: obj.etag, size: obj.size });
    }
    cursor = data.result_info?.is_truncated ? data.result_info.cursor : null;
    await new Promise((r) => setTimeout(r, 200));
  } while (cursor);
  return index;
}

async function verifyBucket(bucket) {
  console.log(`\n--- ${bucket} ---`);
  const src = await listAll(SRC_ACCOUNT, bucket);
  const dst = await listAll(DST_ACCOUNT, bucket);

  let missing = 0;
  let mismatch = 0;

  for (const [key, meta] of src) {
    const hit = dst.get(key);
    if (!hit) {
      missing++;
      if (missing <= 5) console.log(`  缺失: ${key}`);
    } else if (hit.etag !== meta.etag) {
      mismatch++;
      if (mismatch <= 5) console.log(`  etag 不一致: ${key}`);
    }
  }

  const extra = [...dst.keys()].filter((k) => !src.has(k)).length;

  console.log(`  源: ${src.size}  目标: ${dst.size}`);
  console.log(`  缺失: ${missing}  etag不一致: ${mismatch}  目标多余: ${extra}`);

  return { bucket, srcCount: src.size, dstCount: dst.size, missing, mismatch, extra, ok: missing === 0 && mismatch === 0 };
}

async function main() {
  console.log("R2 迁移校验");
  const results = [];
  for (const bucket of BUCKETS) {
    results.push(await verifyBucket(bucket));
  }

  console.log("\n=== 汇总 ===");
  let allOk = true;
  for (const r of results) {
    const status = r.ok ? "OK" : "FAIL";
    console.log(`  ${r.bucket}: ${status} (源 ${r.srcCount} → 目标 ${r.dstCount})`);
    if (!r.ok) allOk = false;
  }

  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
