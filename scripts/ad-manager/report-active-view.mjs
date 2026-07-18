/**
 * 拉取 GAM Active View 报表并按广告位/设备汇总。
 * 用法:
 *   npm run gam:report-av
 *   npm run gam:report-av -- --days=14
 *   npm run gam:report-av -- --device
 */
import { gunzipSync } from "node:zlib";
import { soapCall, pickTag } from "./soap.mjs";
import { resolveProxy } from "./request.mjs";
import { GAM_API } from "./config.mjs";

const daysArg = process.argv.find((a) => a.startsWith("--days="));
const DAYS = Number(daysArg?.split("=")[1] || 7);
const WITH_DEVICE = process.argv.includes("--device");

const COLUMNS = [
  "TOTAL_LINE_ITEM_LEVEL_IMPRESSIONS",
  "TOTAL_ACTIVE_VIEW_ELIGIBLE_IMPRESSIONS",
  "TOTAL_ACTIVE_VIEW_MEASURABLE_IMPRESSIONS",
  "TOTAL_ACTIVE_VIEW_VIEWABLE_IMPRESSIONS",
  "TOTAL_ACTIVE_VIEW_MEASURABLE_IMPRESSIONS_RATE",
  "TOTAL_ACTIVE_VIEW_VIEWABLE_IMPRESSIONS_RATE",
  "AD_EXCHANGE_LINE_ITEM_LEVEL_IMPRESSIONS",
  "AD_EXCHANGE_ACTIVE_VIEW_VIEWABLE_IMPRESSIONS",
  "AD_EXCHANGE_ACTIVE_VIEW_VIEWABLE_IMPRESSIONS_RATE",
  "ADSENSE_LINE_ITEM_LEVEL_IMPRESSIONS",
  "ADSENSE_ACTIVE_VIEW_VIEWABLE_IMPRESSIONS",
  "ADSENSE_ACTIVE_VIEW_VIEWABLE_IMPRESSIONS_RATE",
];

function dateOffset(daysAgo) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

function dateXml(d) {
  return `<v:year>${d.y}</v:year><v:month>${d.m}</v:month><v:day>${d.day}</v:day>`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    return row;
  });
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (c === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function num(v) {
  if (v == null || v === "" || v === "-") return 0;
  const n = Number(String(v).replace(/%/g, "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function pct(viewable, measurable) {
  if (!measurable) return null;
  return (100 * viewable) / measurable;
}

function fmtPct(rate) {
  if (rate == null || !Number.isFinite(rate)) return "n/a";
  // CSV_DUMP rates are often 0–1 fractions; UI percentages come as 0–100
  const p = rate <= 1.0001 ? rate * 100 : rate;
  return p.toFixed(1) + "%";
}

function fmtInt(n) {
  return Math.round(n).toLocaleString("en-US");
}

async function runReport(dimensions) {
  const start = dateOffset(DAYS);
  const end = dateOffset(1); // 昨天为止（当天数据常不完整）

  const dimXml = dimensions.map((d) => `<v:dimensions>${d}</v:dimensions>`).join("");
  const colXml = COLUMNS.map((c) => `<v:columns>${c}</v:columns>`).join("");

  const methodBody = `<v:runReportJob>
      <v:reportJob>
        <v:reportQuery>
          ${dimXml}
          <v:adUnitView>FLAT</v:adUnitView>
          ${colXml}
          <v:startDate>${dateXml(start)}</v:startDate>
          <v:endDate>${dateXml(end)}</v:endDate>
          <v:dateRangeType>CUSTOM_DATE</v:dateRangeType>
        </v:reportQuery>
      </v:reportJob>
    </v:runReportJob>`;
  if (process.env.GAM_DEBUG) {
    console.log(methodBody.slice(0, 800));
  }

  const runXml = await soapCall("ReportService", methodBody);

  const jobId = pickTag(runXml, "id");
  if (!jobId) {
    throw new Error("runReportJob 未返回 id: " + runXml.slice(0, 500));
  }
  process.stdout.write(`  reportJob ${jobId} …`);

  for (let i = 0; i < 60; i++) {
    await sleep(2000);
    const stXml = await soapCall(
      "ReportService",
      `<v:getReportJobStatus><v:reportJobId>${jobId}</v:reportJobId></v:getReportJobStatus>`
    );
    const status = pickTag(stXml, "rval") || "";
    process.stdout.write(".");
    if (status === "COMPLETED") {
      process.stdout.write(" done\n");
      break;
    }
    if (status === "FAILED") {
      throw new Error("Report FAILED: " + stXml.slice(0, 800));
    }
    if (i === 59) {
      throw new Error("Report timeout, last status=" + status);
    }
  }

  const urlXml = await soapCall(
    "ReportService",
    `<v:getReportDownloadUrlWithOptions>
      <v:reportJobId>${jobId}</v:reportJobId>
      <v:reportDownloadOptions>
        <v:exportFormat>CSV_DUMP</v:exportFormat>
        <v:includeReportProperties>false</v:includeReportProperties>
        <v:includeTotalsRow>false</v:includeTotalsRow>
        <v:useGzipCompression>true</v:useGzipCompression>
      </v:reportDownloadOptions>
    </v:getReportDownloadUrlWithOptions>`
  );

  const downloadUrl = decodeXmlEntities(pickTag(urlXml, "rval") || "");
  if (!downloadUrl) {
    throw new Error("无下载 URL: " + urlXml.slice(0, 500));
  }
  return downloadUrl;
}

function decodeXmlEntities(s) {
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function downloadGzipCsv(url) {
  const { spawnSync } = await import("node:child_process");
  const fs = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const px = resolveProxy();
  const outPath = fileURLToPath(new URL("./_av-report.csv.gz", import.meta.url));

  // GCS 签名 URL：必须解码 &amp;；通常不要带 Authorization
  const attempts = [{ label: "no-auth", headers: [] }];

  let lastErr = null;
  for (const attempt of attempts) {
    const args = ["-sS", "-m", "120", "-L", "-w", "%{http_code}", "-o", outPath];
    if (px) {
      args.push(
        "-x",
        px.startsWith("http") || px.startsWith("socks") ? px : `http://${px}`
      );
    }
    args.push(...attempt.headers);
    args.push(url);

    const result = spawnSync("curl.exe", args, {
      encoding: "utf8",
      maxBuffer: 5 * 1024 * 1024,
    });
    if (result.status !== 0) {
      lastErr = new Error((result.stderr || result.stdout || "curl failed").trim());
      continue;
    }
    const status = Number((result.stdout || "").trim().slice(-3));
    if (!fs.existsSync(outPath)) {
      lastErr = new Error(`下载失败 HTTP ${status}（无文件）`);
      continue;
    }
    const buf = fs.readFileSync(outPath);
    if (status < 200 || status >= 300) {
      lastErr = new Error(
        `下载失败 HTTP ${status} [${attempt.label}] ${buf.toString("utf8").slice(0, 200)}`
      );
      continue;
    }

    let text;
    try {
      text = gunzipSync(buf).toString("utf8");
    } catch {
      text = buf.toString("utf8");
    }
    try {
      fs.unlinkSync(outPath);
    } catch {
      /* ignore */
    }
    return parseCsv(text);
  }
  throw lastErr || new Error("下载失败");
}

function col(row, key) {
  // CSV_DUMP headers like Column.TOTAL_ACTIVE_VIEW_VIEWABLE_IMPRESSIONS
  const full = Object.keys(row).find(
    (k) => k === key || k.endsWith("." + key) || k === "Column." + key || k === "Dimension." + key
  );
  return full ? row[full] : row[key];
}

function summarize(rows, groupKey) {
  const groups = new Map();
  for (const row of rows) {
    const name = col(row, groupKey) || col(row, "AD_UNIT_NAME") || "(unknown)";
    const device = col(row, "DEVICE_CATEGORY_NAME");
    const key = device ? `${name}||${device}` : name;
    const g = groups.get(key) || {
      name,
      device: device || "",
      imps: 0,
      eligible: 0,
      measurable: 0,
      viewable: 0,
      adxImps: 0,
      adxViewable: 0,
      adsenseImps: 0,
      adsenseViewable: 0,
    };
    g.imps += num(col(row, "TOTAL_LINE_ITEM_LEVEL_IMPRESSIONS"));
    g.eligible += num(col(row, "TOTAL_ACTIVE_VIEW_ELIGIBLE_IMPRESSIONS"));
    g.measurable += num(col(row, "TOTAL_ACTIVE_VIEW_MEASURABLE_IMPRESSIONS"));
    g.viewable += num(col(row, "TOTAL_ACTIVE_VIEW_VIEWABLE_IMPRESSIONS"));
    g.adxImps += num(col(row, "AD_EXCHANGE_LINE_ITEM_LEVEL_IMPRESSIONS"));
    g.adxViewable += num(col(row, "AD_EXCHANGE_ACTIVE_VIEW_VIEWABLE_IMPRESSIONS"));
    g.adsenseImps += num(col(row, "ADSENSE_LINE_ITEM_LEVEL_IMPRESSIONS"));
    g.adsenseViewable += num(
      col(row, "ADSENSE_ACTIVE_VIEW_VIEWABLE_IMPRESSIONS")
    );
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.imps - a.imps);
}

function printTable(title, rows, { device = false } = {}) {
  console.log("\n" + title);
  console.log("-".repeat(title.length));
  const header = device
    ? "imps".padStart(10) +
      "  " +
      "meas%".padStart(7) +
      "  " +
      "view%".padStart(7) +
      "  " +
      "device".padEnd(10) +
      "  unit"
    : "imps".padStart(10) +
      "  " +
      "meas%".padStart(7) +
      "  " +
      "view%".padStart(7) +
      "  " +
      "ADX_v%".padStart(7) +
      "  " +
      "AS_v%".padStart(7) +
      "  unit";
  console.log(header);

  for (const r of rows) {
    if (r.imps < 10 && r.measurable < 10) continue;
    const measRate = pct(r.measurable, r.eligible);
    const viewRate = pct(r.viewable, r.measurable);
    // ADX/AdSense measurable not always in same columns; approximate with impressions as denom fallback
    const adxView = pct(r.adxViewable, r.adxImps);
    const asView = pct(r.adsenseViewable, r.adsenseImps);
    if (device) {
      console.log(
        fmtInt(r.imps).padStart(10) +
          "  " +
          fmtPct(measRate).padStart(7) +
          "  " +
          fmtPct(viewRate).padStart(7) +
          "  " +
          String(r.device).padEnd(10) +
          "  " +
          r.name
      );
    } else {
      console.log(
        fmtInt(r.imps).padStart(10) +
          "  " +
          fmtPct(measRate).padStart(7) +
          "  " +
          fmtPct(viewRate).padStart(7) +
          "  " +
          fmtPct(adxView).padStart(7) +
          "  " +
          fmtPct(asView).padStart(7) +
          "  " +
          r.name
      );
    }
  }
}

function printTotals(rows) {
  const t = rows.reduce(
    (a, r) => {
      a.imps += r.imps;
      a.eligible += r.eligible;
      a.measurable += r.measurable;
      a.viewable += r.viewable;
      a.adxImps += r.adxImps;
      a.adxViewable += r.adxViewable;
      a.adsenseImps += r.adsenseImps;
      a.adsenseViewable += r.adsenseViewable;
      return a;
    },
    {
      imps: 0,
      eligible: 0,
      measurable: 0,
      viewable: 0,
      adxImps: 0,
      adxViewable: 0,
      adsenseImps: 0,
      adsenseViewable: 0,
    }
  );

  console.log("\n=== 全网汇总（近 " + DAYS + " 天，不含今天）===");
  console.log(`网络: ${GAM_API.networkCode}`);
  console.log(`总展示:           ${fmtInt(t.imps)}`);
  console.log(`AV 可测 eligible: ${fmtInt(t.eligible)}`);
  console.log(`AV measurable:    ${fmtInt(t.measurable)}  (${fmtPct(pct(t.measurable, t.eligible))})`);
  console.log(`AV viewable:      ${fmtInt(t.viewable)}  (${fmtPct(pct(t.viewable, t.measurable))} of measurable)`);
  console.log(`ADX 展示/可见:    ${fmtInt(t.adxImps)} / ${fmtInt(t.adxViewable)}`);
  console.log(`AdSense 展示/可见:${fmtInt(t.adsenseImps)} / ${fmtInt(t.adsenseViewable)}`);

  const worst = [...rows]
    .filter((r) => r.measurable >= 50)
    .sort((a, b) => pct(a.viewable, a.measurable) - pct(b.viewable, b.measurable))
    .slice(0, 12);

  console.log("\n=== Active View 可见率最差广告位（measurable≥50）===");
  for (const r of worst) {
    console.log(
      `  ${fmtPct(pct(r.viewable, r.measurable)).padStart(7)}  imps=${fmtInt(r.imps).padStart(8)}  ${r.name}`
    );
  }

  const best = [...rows]
    .filter((r) => r.measurable >= 50)
    .sort((a, b) => pct(b.viewable, b.measurable) - pct(a.viewable, a.measurable))
    .slice(0, 8);

  console.log("\n=== Active View 可见率最好广告位（measurable≥50）===");
  for (const r of best) {
    console.log(
      `  ${fmtPct(pct(r.viewable, r.measurable)).padStart(7)}  imps=${fmtInt(r.imps).padStart(8)}  ${r.name}`
    );
  }

  return t;
}

console.log(`GAM Active View 报表 · network ${GAM_API.networkCode} · 近 ${DAYS} 天\n`);

console.log("1) 按广告单元 (FLAT) …");
const urlByUnit = await runReport(["AD_UNIT_NAME"]);
const rowsByUnit = summarize(await downloadGzipCsv(urlByUnit), "AD_UNIT_NAME");
printTable("按广告位（imps / measurable% / viewable% / ADX_v% / AdSense_v%）", rowsByUnit);
printTotals(rowsByUnit);

if (WITH_DEVICE) {
  console.log("\n2) 按广告单元 × 设备 …");
  const urlDev = await runReport(["AD_UNIT_NAME", "DEVICE_CATEGORY_NAME"]);
  const rowsDev = summarize(await downloadGzipCsv(urlDev), "AD_UNIT_NAME");
  printTable("按广告位 × 设备", rowsDev, { device: true });

  const byDevice = new Map();
  for (const r of rowsDev) {
    const d = r.device || "(unknown)";
    const g = byDevice.get(d) || { name: d, imps: 0, measurable: 0, viewable: 0, eligible: 0 };
    g.imps += r.imps;
    g.measurable += r.measurable;
    g.viewable += r.viewable;
    g.eligible += r.eligible;
    byDevice.set(d, g);
  }
  printTable("按设备汇总", [...byDevice.values()].sort((a, b) => b.imps - a.imps));
}

console.log("\n说明: view% = viewable / measurable（Active View 可见率）");
console.log("     meas% = measurable / eligible（可测量率，过低说明测量被干扰）");
