import { getGamAccessToken } from "./auth.mjs";
import { GAM_API } from "./config.mjs";
import { curlRequest, resolveProxy } from "./request.mjs";
import { getApiVersion, serviceUrl, soapNamespace } from "./versions.mjs";

const NS = soapNamespace(getApiVersion());

export async function soapCall(service, methodBody) {
  const token = await getGamAccessToken();
  const url = serviceUrl(getApiVersion(), service);

  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:v="${NS}">
  <soapenv:Header>
    <v:RequestHeader>
      <v:networkCode>${GAM_API.networkCode}</v:networkCode>
      <v:applicationName>ApkHouse-AdManager-Script</v:applicationName>
    </v:RequestHeader>
  </soapenv:Header>
  <soapenv:Body>
    ${methodBody}
  </soapenv:Body>
</soapenv:Envelope>`;

  const res = curlRequest(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/xml; charset=UTF-8",
      SOAPAction: "",
    },
    body: envelope,
    proxy: resolveProxy(),
  });

  const text = res.text;
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 600)}`);
  }
  if (text.includes("<soap:Fault>") || text.includes("Fault>")) {
    const fault = text.match(/<faultstring>([^<]*)<\/faultstring>/i);
    throw new Error(fault ? fault[1] : text.slice(0, 600));
  }
  return text;
}

export function xmlEscape(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function pickTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m ? m[1] : null;
}

export function pickAllTags(xml, tag) {
  return [...xml.matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, "g"))].map((m) => m[1]);
}

export function sizesToXml(sizes) {
  if (!sizes || !sizes.length) {
    return "";
  }
  const blocks = [];
  for (const s of sizes) {
    if (s === "fluid") {
      blocks.push(
        "<v:adUnitSizes><v:size><v:width>-1</v:width><v:height>-1</v:height></v:size></v:adUnitSizes>"
      );
    } else if (Array.isArray(s) && s.length === 2) {
      blocks.push(
        `<v:adUnitSizes><v:size><v:width>${s[0]}</v:width><v:height>${s[1]}</v:height></v:size></v:adUnitSizes>`
      );
    }
  }
  return blocks.join("");
}
