import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WRANGLER_CLIENT_ID = "54d11594-84e4-41aa-b438-e81b8fa78ee7";
const TOKEN_URL = "https://dash.cloudflare.com/oauth2/token";

const SRC_ACCOUNT = process.env.R2_SRC_ACCOUNT_ID || "0e70af17109f26d0d034bab33006f59e";
const DST_ACCOUNT = process.env.R2_DST_ACCOUNT_ID || "892acd09257ee1251aca55e5a6f9946e";

let refreshPromise = null;
let cachedToken = null;

/** 从 secrets/r2-migrate.env 加载（不覆盖已有环境变量） */
export function loadR2MigrateEnv() {
  const envPath = path.resolve(__dirname, "../secrets/r2-migrate.env");
  if (!fs.existsSync(envPath)) return false;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
  return true;
}

loadR2MigrateEnv();

function authConfigPaths() {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  return [
    process.env.WRANGLER_HOME,
    `${home}/AppData/Roaming/xdg.config/.wrangler/config/default.toml`,
    `${home}/.wrangler/config/default.toml`,
  ].filter(Boolean);
}

export function findAuthConfigPath() {
  for (const p of authConfigPaths()) {
    try {
      if (fs.statSync(p).isFile()) return p;
    } catch {
      // try next
    }
  }
  return null;
}

function readField(text, key) {
  const match = text.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, "m"));
  return match?.[1] ?? null;
}

export function readAuthConfig() {
  const envToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (envToken) {
    return { path: null, apiToken: envToken };
  }

  const path = findAuthConfigPath();
  if (!path) throw new Error("缺少 Wrangler OAuth 配置，请先运行 wrangler login");

  const text = fs.readFileSync(path, "utf8");
  return {
    path,
    oauth_token: readField(text, "oauth_token"),
    refresh_token: readField(text, "refresh_token"),
    expiration_time: readField(text, "expiration_time"),
    raw: text,
  };
}

function writeAuthField(text, key, value) {
  const line = `${key} = "${value}"`;
  const re = new RegExp(`^${key}\\s*=.*$`, "m");
  if (re.test(text)) return text.replace(re, line);
  return `${text.trimEnd()}\n${line}\n`;
}

function writeAuthConfig(path, { oauth_token, refresh_token, expiration_time }) {
  let text = fs.readFileSync(path, "utf8");
  if (oauth_token) text = writeAuthField(text, "oauth_token", oauth_token);
  if (refresh_token) text = writeAuthField(text, "refresh_token", refresh_token);
  if (expiration_time) text = writeAuthField(text, "expiration_time", expiration_time);
  fs.writeFileSync(path, text);
}

export function getBearerToken() {
  if (process.env.CLOUDFLARE_API_TOKEN?.trim()) {
    cachedToken = process.env.CLOUDFLARE_API_TOKEN.trim();
    return cachedToken;
  }
  if (cachedToken) return cachedToken;
  const config = readAuthConfig();
  if (!config.oauth_token) {
    throw new Error("缺少 oauth_token，请先运行 wrangler login");
  }
  cachedToken = config.oauth_token;
  return cachedToken;
}

export function usingR2ApiTokens() {
  return Boolean(process.env.R2_SRC_API_TOKEN?.trim() && process.env.R2_DST_API_TOKEN?.trim());
}

export function getAccountApiToken(accountId) {
  if (accountId === SRC_ACCOUNT && process.env.R2_SRC_API_TOKEN?.trim()) {
    return process.env.R2_SRC_API_TOKEN.trim();
  }
  if (accountId === DST_ACCOUNT && process.env.R2_DST_API_TOKEN?.trim()) {
    return process.env.R2_DST_API_TOKEN.trim();
  }
  return getBearerToken();
}

export function authHeadersForAccount(accountId, extra = {}) {
  return { Authorization: `Bearer ${getAccountApiToken(accountId)}`, ...extra };
}

export function authHeaders(extra = {}) {
  return { Authorization: `Bearer ${getBearerToken()}`, ...extra };
}

function tokenExpired(config) {
  if (!config.expiration_time) return true;
  return Date.now() >= new Date(config.expiration_time).getTime() - 60_000;
}

async function exchangeRefreshToken(config) {
  if (!config.refresh_token) {
    throw new Error("缺少 refresh_token，请重新运行 wrangler login");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: config.refresh_token,
    client_id: WRANGLER_CLIENT_ID,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`OAuth refresh 失败 (${res.status}): ${text.slice(0, 300)}`);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`OAuth refresh 返回无效 JSON: ${text.slice(0, 200)}`);
  }

  if (json.error) {
    throw new Error(`OAuth refresh 错误: ${json.error}`);
  }

  const oauth_token = json.access_token;
  const refresh_token = json.refresh_token || config.refresh_token;
  const expiration_time = new Date(Date.now() + (json.expires_in || 3600) * 1000).toISOString();

  if (config.path) {
    writeAuthConfig(config.path, { oauth_token, refresh_token, expiration_time });
  }

  cachedToken = oauth_token;
  return oauth_token;
}

export async function refreshOAuthToken(force = false) {
  if (process.env.CLOUDFLARE_API_TOKEN?.trim()) {
    cachedToken = process.env.CLOUDFLARE_API_TOKEN.trim();
    return cachedToken;
  }

  const config = readAuthConfig();
  if (!force && !tokenExpired(config) && config.oauth_token) {
    cachedToken = config.oauth_token;
    return cachedToken;
  }

  if (!refreshPromise) {
    refreshPromise = exchangeRefreshToken(config).finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

export async function ensureAuthReady() {
  if (usingR2ApiTokens()) return;
  if (process.env.CLOUDFLARE_API_TOKEN?.trim()) return;
  const config = readAuthConfig();
  if (tokenExpired(config)) {
    await refreshOAuthToken(true);
  } else {
    cachedToken = config.oauth_token;
  }
}
