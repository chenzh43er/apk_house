import { getGamAccessToken } from "./auth.mjs";
import { GAM_API } from "./config.mjs";
import { curlRequest, resolveProxy } from "./request.mjs";

export async function gamRequest(method, path, body = null) {
  const token = await getGamAccessToken();
  const url = path.startsWith("http") ? path : `${GAM_API.restBase}${path}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  if (body != null) {
    headers["Content-Type"] = "application/json";
  }

  const res = curlRequest(url, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : null,
    proxy: resolveProxy(),
    timeoutSec: 120,
  });

  let data = null;
  if (res.text && res.text.trim()) {
    try {
      data = JSON.parse(res.text);
    } catch {
      data = { raw: res.text };
    }
  }

  if (res.status >= 400) {
    const msg =
      data?.error?.message ||
      data?.message ||
      (typeof data?.raw === "string" ? data.raw.slice(0, 400) : null) ||
      `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export async function listNetworks() {
  const data = await gamRequest("GET", "/networks");
  return data.networks || [];
}

export async function getNetwork(networkCode) {
  return gamRequest("GET", `/networks/${networkCode}`);
}

/** 诊断当前凭证对指定 network 的访问权限 */
export async function diagnoseNetworkAccess(networkCode) {
  const token = await getGamAccessToken();
  const proxy = resolveProxy();
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };

  const listRes = curlRequest(`${GAM_API.restBase}/networks`, {
    method: "GET",
    headers,
    proxy,
    timeoutSec: 120,
  });

  let listData = null;
  if (listRes.text?.trim()) {
    try {
      listData = JSON.parse(listRes.text);
    } catch {
      listData = { raw: listRes.text };
    }
  }

  const getRes = curlRequest(`${GAM_API.restBase}/networks/${networkCode}`, {
    method: "GET",
    headers,
    proxy,
    timeoutSec: 120,
  });

  let getData = null;
  if (getRes.text?.trim()) {
    try {
      getData = JSON.parse(getRes.text);
    } catch {
      getData = { raw: getRes.text };
    }
  }

  return {
    oauthOk: Boolean(token),
    list: {
      status: listRes.status,
      count: listData?.networks?.length ?? 0,
      body: listData,
    },
    get: {
      status: getRes.status,
      body: getData,
      reason: getData?.error?.details?.find((d) => d.reason)?.reason || null,
    },
  };
}

export async function listAllAdUnits(networkCode) {
  const items = [];
  let pageToken = "";
  do {
    const query = new URLSearchParams({ pageSize: "1000" });
    if (pageToken) query.set("pageToken", pageToken);
    const data = await gamRequest(
      "GET",
      `/networks/${networkCode}/adUnits?${query.toString()}`
    );
    items.push(...(data.adUnits || []));
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return items;
}

export function sizesToRest(sizes) {
  if (!sizes || !sizes.length) {
    return [];
  }
  return sizes
    .filter((s) => s !== "fluid")
    .map((s) => {
      if (!Array.isArray(s) || s.length !== 2) {
        return null;
      }
      return {
        size: { width: s[0], height: s[1], sizeType: "PIXEL" },
        environmentType: "BROWSER",
      };
    })
    .filter(Boolean);
}

/** 从 GAM 返回的 adUnitSizes 去掉 FLUID / IGNORED（保留 PIXEL） */
export function pixelSizesFromRest(adUnitSizes) {
  if (!adUnitSizes?.length) {
    return [];
  }
  return adUnitSizes.filter((entry) => {
    const type = entry?.size?.sizeType;
    return type === "PIXEL" && entry.size.width > 0 && entry.size.height > 0;
  });
}

export function hasFluidSize(adUnitSizes) {
  return (adUnitSizes || []).some((entry) => entry?.size?.sizeType === "FLUID");
}

export async function patchAdUnit(adUnitName, body, updateMask) {
  const query = updateMask
    ? `?updateMask=${encodeURIComponent(updateMask)}`
    : "";
  return gamRequest("PATCH", `/${adUnitName}${query}`, body);
}

/** Out-of-Page 广告单元尺寸（GAM REST API SizeType） */
export function oopFormatToRestSizes(format) {
  if (format === "INTERSTITIAL") {
    return [
      {
        size: { width: 1, height: 1, sizeType: "INTERSTITIAL" },
        environmentType: "BROWSER",
      },
    ];
  }

  // 锚定 / 侧栏：Out-of-page，1x1 IGNORED
  return [
    {
      size: { width: 1, height: 1, sizeType: "IGNORED" },
      environmentType: "BROWSER",
    },
  ];
}

export async function createAdUnit(networkCode, adUnit) {
  return gamRequest("POST", `/networks/${networkCode}/adUnits`, adUnit);
}

export async function batchCreateAdUnits(networkCode, requests) {
  return gamRequest("POST", `/networks/${networkCode}/adUnits:batchCreate`, {
    requests,
  });
}
