import fs from "node:fs";

const home = process.env.USERPROFILE || process.env.HOME || "";
const token = fs.readFileSync(`${home}/AppData/Roaming/xdg.config/.wrangler/config/default.toml`, "utf8").match(/oauth_token\s*=\s*"([^"]+)"/)[1];
const API = "https://api.cloudflare.com/client/v4";
const SRC = "0e70af17109f26d0d034bab33006f59e";
const DST = "892acd09257ee1251aca55e5a6f9946e";

async function count(accountId, bucket) {
  let total = 0;
  let cursor;
  do {
    const url = new URL(`${API}/accounts/${accountId}/r2/buckets/${bucket}/objects`);
    url.searchParams.set("limit", "1000");
    if (cursor) url.searchParams.set("cursor", cursor);
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await r.json();
    if (!data.success) throw new Error(JSON.stringify(data.errors));
    total += (data.result || []).length;
    cursor = data.result_info?.is_truncated ? data.result_info.cursor : null;
    await new Promise((x) => setTimeout(x, 150));
  } while (cursor);
  return total;
}

console.log("R2 桶对象数量对比:\n");
for (const b of ["houseus", "housepic", "houseat", "housech"]) {
  const src = await count(SRC, b);
  const dst = await count(DST, b);
  const ok = src === dst ? "OK" : "进行中";
  console.log(`  ${b}: 源 ${src} → 目标 ${dst} [${ok}]`);
}
