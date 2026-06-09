#!/usr/bin/env node
import fs from "node:fs";

const ACCOUNT = "0e70af17109f26d0d034bab33006f59e";
const WORKER = process.argv[2] || "billowing-leaf-30ae";

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
    } catch {}
  }
  throw new Error("No wrangler oauth token found");
}

const token = readWranglerOAuthToken();
const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

const base = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/scripts/${WORKER}`;

const listRes = await fetch(`${base}/routes`, { headers });
const listData = await listRes.json();
console.log("Current routes:", JSON.stringify(listData.result, null, 2));

const putRes = await fetch(`${base}/routes`, {
  method: "PUT",
  headers,
  body: JSON.stringify([]),
});
const putData = await putRes.json();
if (!putData.success) {
  console.error(JSON.stringify(putData, null, 2));
  process.exit(1);
}
console.log("Routes cleared for", WORKER);
