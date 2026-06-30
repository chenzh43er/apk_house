import { GAM_API } from "./config.mjs";

/** 按从新到旧排列，404 时自动降级尝试 */
export const GAM_API_VERSIONS = [
  "v202511",
  "v202508",
  "v202505",
  "v202502",
  "v202411",
];

export function getApiVersion() {
  return process.env.GAM_API_VERSION || GAM_API.apiVersion;
}

export function soapNamespace(version) {
  return `https://www.google.com/apis/ads/publisher/${version}`;
}

export function serviceUrl(version, service) {
  return `https://ads.google.com/apis/ads/publisher/${version}/${service}`;
}
