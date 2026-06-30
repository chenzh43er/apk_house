import fs from "node:fs";
import crypto from "node:crypto";
import { GAM_API } from "./config.mjs";
import { curlRequest, resolveProxy } from "./request.mjs";

/**
 * 使用服务账号 JSON 获取 Ad Manager API 访问 token。
 * 通过 curl 走代理（支持 SOCKS5，适配优连等加速器）。
 */
export async function getGamAccessToken() {
  if (!fs.existsSync(GAM_API.credentialsPath)) {
    throw new Error(
      `未找到凭证文件: ${GAM_API.credentialsPath}\n` +
        "请将 service account JSON 放到 secrets/gam-service-account.json"
    );
  }

  const key = JSON.parse(fs.readFileSync(GAM_API.credentialsPath, "utf8"));
  const now = Math.floor(Date.now() / 1000);

  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(
    JSON.stringify({
      iss: key.client_email,
      scope: GAM_API.scope,
      aud: key.token_uri,
      iat: now,
      exp: now + 3600,
    })
  );

  const unsigned = `${header}.${claim}`;
  const signature = await signRs256(unsigned, key.private_key);
  const jwt = `${unsigned}.${signature}`;

  const proxy = resolveProxy();
  let res;
  try {
    res = curlRequest(key.token_uri, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }).toString(),
      proxy,
    });
  } catch (err) {
    const hint = proxy
      ? `\n当前代理: ${proxy}\n若仍失败，请运行 npm run gam:probe 查找正确代理（优连多为 socks5h://）`
      : "\n未检测到代理。浏览器能开 Google 时，请运行 npm run gam:probe";
    throw new Error(`无法连接 Google OAuth${hint}\n${err.message}`);
  }

  const data = JSON.parse(res.text || "{}");
  if (res.status < 200 || res.status >= 300) {
    throw new Error(
      `获取 token 失败: ${data.error || res.status} ${data.error_description || res.text?.slice(0, 200)}`
    );
  }
  return data.access_token;
}

function base64Url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function signRs256(data, privateKeyPem) {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(data)
  );
  return base64Url(Buffer.from(sig));
}

function pemToArrayBuffer(pem) {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  return Uint8Array.from(Buffer.from(b64, "base64")).buffer;
}
