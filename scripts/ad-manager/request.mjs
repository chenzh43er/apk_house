import { spawnSync } from "node:child_process";

/** 当前使用的代理（由 resolveProxy / 环境变量决定） */
let activeProxy = null;

export function getActiveProxy() {
  return activeProxy;
}

export function resolveProxy() {
  if (process.env.GAM_PROXY) {
    return process.env.GAM_PROXY;
  }
  const all = process.env.ALL_PROXY || process.env.all_proxy;
  if (all) return all;
  const https = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (https) return https;
  const http = process.env.HTTP_PROXY || process.env.http_proxy;
  if (http) return http;
  return readWindowsSystemProxy();
}

/** 读取 Windows 系统代理（优连等加速器常会写入） */
export function readWindowsSystemProxy() {
  if (process.platform !== "win32") return null;
  try {
    const ps = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings').ProxyEnable; (Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings').ProxyServer",
      ],
      { encoding: "utf8", timeout: 10000 }
    );
    const lines = (ps.stdout || "").trim().split(/\r?\n/).map((l) => l.trim());
    if (lines[0] !== "1" || !lines[1]) return null;
    const server = lines[1];
    if (server.includes("=")) {
      const httpsPart = server.split(";").find((p) => p.toLowerCase().startsWith("https="));
      if (httpsPart) return `http://${httpsPart.split("=")[1]}`;
    }
    return server.startsWith("http") ? server : `http://${server}`;
  } catch {
    return null;
  }
}

function normalizeProxyForCurl(proxy) {
  if (!proxy) return null;
  if (proxy.startsWith("socks") || proxy.startsWith("http")) return proxy;
  return `http://${proxy}`;
}

/**
 * 通过 curl 发请求（支持 SOCKS5 / HTTP 代理，不依赖 npm 包）。
 * 优连等加速器常见为 socks5://127.0.0.1:xxxx，不要用 http:// 连 SOCKS 端口。
 */
export function curlRequest(url, { method = "GET", headers = {}, body = null, proxy = null, timeoutSec = null } = {}) {
  const px = normalizeProxyForCurl(proxy ?? resolveProxy());
  activeProxy = px;

  const timeout =
    timeoutSec ??
    Number(process.env.GAM_CURL_TIMEOUT || 90);

  const args = ["-sS", "-m", String(timeout), "-w", "\n__HTTP_CODE__:%{http_code}"];
  if (px) {
    args.push("-x", px);
  }
  args.push("-X", method);

  for (const [k, v] of Object.entries(headers)) {
    args.push("-H", `${k}: ${v}`);
  }

  if (body != null) {
    args.push("-d", body);
  }
  args.push(url);

  const result = spawnSync("curl", args, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  if (result.error) {
    throw new Error(`curl 不可用: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "curl failed").trim());
  }

  const raw = result.stdout || "";
  const marker = raw.lastIndexOf("\n__HTTP_CODE__:");
  const text = marker >= 0 ? raw.slice(0, marker) : raw;
  const status = marker >= 0 ? Number(raw.slice(marker + 15)) : 0;
  return { status, text };
}

export async function curlFetch(url, options = {}) {
  return curlRequest(url, options);
}
