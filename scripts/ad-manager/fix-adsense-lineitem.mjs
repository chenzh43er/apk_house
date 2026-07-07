/**
 * Set AdSense line item expected sizes: 300x250 + 728x90 + 300x600 (pixel only).
 * AdSense line items in GAM UI have no Fluid option; fluid requests use AdX line item.
 * Usage: node scripts/ad-manager/fix-adsense-lineitem.mjs [lineItemId]
 */
import { soapCall } from "./soap.mjs";
import { GAM_API } from "./config.mjs";

const LINE_ITEM_ID = Number(process.argv[2] || "7360729816");

const READ_ONLY = new Set([
  "stats",
  "deliveryData",
  "status",
  "reservationStatus",
  "isArchived",
  "lastModifiedByApp",
  "lastModifiedDateTime",
  "creationDateTime",
  "isMissingCreatives",
  "orderName",
  "totalResultSetSize",
  "startIndex",
]);

function stripTag(block, tag) {
  return block.replace(new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`, "g"), "");
}

function addVPrefix(xml) {
  return xml.replace(/<\/?([A-Za-z][\w.-]*)/g, (match, name) => {
    if (name.includes(":")) return match;
    return match.startsWith("</") ? `</v:${name}` : `<v:${name}`;
  });
}

async function fetchLineItem(id) {
  const xml = await soapCall(
    "LineItemService",
    `<v:getLineItemsByStatement>
      <v:filterStatement>
        <v:query>WHERE Id = ${id}</v:query>
      </v:filterStatement>
    </v:getLineItemsByStatement>`
  );
  const page = xml.match(/<rval>([\s\S]*?)<\/rval>/)?.[1] || xml;
  const block = page.match(/<results>([\s\S]*?)<\/results>/)?.[1];
  if (!block) throw new Error(`Line item ${id} not found`);
  return block;
}

function placeholdersPlain() {
  const pixel = (w, h) => `<creativePlaceholders>
    <size><width>${w}</width><height>${h}</height><isAspectRatio>false</isAspectRatio></size>
    <expectedCreativeCount>1</expectedCreativeCount>
    <creativeSizeType>PIXEL</creativeSizeType>
    <isAmpOnly>false</isAmpOnly>
  </creativePlaceholders>`;
  // AdSense backfill: pixel sizes only (matches gam-backfill-* creatives in GAM UI)
  return pixel(300, 250) + pixel(728, 90) + pixel(300, 600);
}

function toUpdatePayload(block) {
  let next = block;
  for (const tag of READ_ONLY) next = stripTag(next, tag);
  next = stripTag(next, "creativePlaceholders");
  // Insert placeholders before environmentType (schema position after cost fields)
  if (next.includes("<environmentType>")) {
    next = next.replace("<environmentType>", `${placeholdersPlain()}<environmentType>`);
  } else {
    next = placeholdersPlain() + next;
  }
  return addVPrefix(next);
}

function summarize(block) {
  const sizes = [...block.matchAll(/<creativePlaceholders>[\s\S]*?<\/creativePlaceholders>/g)].map(
    (m) => {
      const ph = m[0];
      const t = ph.match(/<creativeSizeType>([^<]+)<\/creativeSizeType>/)?.[1];
      if (t === "FLUID" || t === "IGNORED") return "Fluid(IGNORED)";
      if (t === "INTERSTITIAL") return "Interstitial(OOP)";
      const w = ph.match(/<width>(\d+)<\/width>/)?.[1];
      const h = ph.match(/<height>(\d+)<\/height>/)?.[1];
      return `${w}x${h}`;
    }
  );
  return sizes.join(", ");
}

async function main() {
  console.log(`Fix AdSense line item ${LINE_ITEM_ID} on ${GAM_API.networkCode}`);
  const before = await fetchLineItem(LINE_ITEM_ID);
  console.log("before placeholders:", summarize(before));

  const payload = toUpdatePayload(before);
  await soapCall(
    "LineItemService",
    `<v:updateLineItems><v:lineItems>${payload}</v:lineItems></v:updateLineItems>`
  );

  const after = await fetchLineItem(LINE_ITEM_ID);
  console.log("after placeholders:", summarize(after));
  console.log("Re-run: npm run gam:check-adsense");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
