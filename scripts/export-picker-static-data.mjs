/**
 * 从 Supabase 导出选择器静态 JSON：states / cities（可选 districts）。
 * 用法：node scripts/export-picker-static-data.mjs [--districts] [--region=us|de|ch|at|all]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const PROJECTS = {
  us: {
    url: "https://uoxzcftzwemdrmcmhuhb.supabase.co",
    key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVveHpjZnR6d2VtZHJtY21odWhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxMjkwNDMsImV4cCI6MjA2OTcwNTA0M30.0IVKS1y4dgjgQbNPTonITxki8btCAREEF2VPjL_0jvc",
  },
  de: {
    url: "https://aabogtftiapiwehgmezt.supabase.co",
    key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhYm9ndGZ0aWFwaXdlaGdtZXp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA3MDEyNTgsImV4cCI6MjA2NjI3NzI1OH0.qU2mirqnkhRtHNduka5SNwoi2K3q7tNaCJL7EfKMwCY",
  },
  ch: {
    url: "https://yioqqdprzzeqrlwfyqov.supabase.co",
    key: "sb_publishable_4Rhk--WUKJFTeEDjwveyjg_kaIPxlDa",
  },
  at: {
    url: "https://zxvflhunzznslxzqreih.supabase.co",
    key: "sb_publishable_rR8k81Y-lslto8ZIME11Hg_iorubIcG",
  },
};

const EXCLUDED_US = new Set(["District of Columbia"]);

function parseArgs(argv) {
  const out = { districts: false, region: "all" };
  for (const a of argv) {
    if (a === "--districts") out.districts = true;
    if (a.startsWith("--region=")) out.region = a.slice(9);
  }
  return out;
}

async function rpc(project, name, body = {}) {
  const res = await fetch(`${project.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: project.key,
      Authorization: `Bearer ${project.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${name} ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
}

async function exportRegion(region, withDistricts) {
  const project = PROJECTS[region];
  if (!project) throw new Error("unknown region " + region);
  const base = path.join(root, "Public", "Data", region);
  console.log("export", region, "->", base);

  let states = await rpc(project, "get_unique_states");
  if (region === "us") {
    states = (states || []).filter((s) => !EXCLUDED_US.has(s.display_state));
  }
  writeJson(path.join(base, "states.json"), states || []);
  console.log("  states", (states || []).length);

  let cityCount = 0;
  for (const st of states || []) {
    const stateName = st.display_state;
    const cities = await rpc(project, "get_cities_by_state", {
      input_state: stateName,
    });
    writeJson(
      path.join(base, "cities", `${stateName}.json`),
      cities || []
    );
    cityCount += (cities || []).length;

    if (withDistricts) {
      for (const c of cities || []) {
        const cityName = c.display_city;
        // prefer table query via PostgREST
        const q = new URL(`${project.url}/rest/v1/house_ger`);
        q.searchParams.set("select", "display_district");
        q.searchParams.set("display_state", `eq.${stateName}`);
        q.searchParams.set("display_city", `eq.${cityName}`);
        const res = await fetch(q, {
          headers: {
            apikey: project.key,
            Authorization: `Bearer ${project.key}`,
          },
        });
        if (!res.ok) continue;
        const rows = await res.json();
        const seen = new Set();
        const unique = [];
        for (const row of rows || []) {
          const d = row.display_district;
          if (d && !seen.has(d)) {
            seen.add(d);
            unique.push({ display_district: d });
          }
        }
        unique.sort((a, b) =>
          a.display_district.localeCompare(b.display_district)
        );
        writeJson(
          path.join(base, "districts", stateName, `${cityName}.json`),
          unique
        );
      }
    }
  }
  console.log("  cities total", cityCount);
}

const args = parseArgs(process.argv.slice(2));
const regions =
  args.region === "all" ? Object.keys(PROJECTS) : [args.region];

for (const r of regions) {
  await exportRegion(r, args.districts);
}
console.log("done");
