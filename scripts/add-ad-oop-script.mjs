import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const EXCLUDE = new Set([
  "de/index.html",
  "us/index.html",
  "de-ch-at/index.html",
]);
const TAG = '<script src="/Public/Js/ad-oop.js"></script>';
const AFTER = '<script src="/Public/Js/ad-runtime.js"></script>';

function walkHtmlFiles(dir, out = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, name.name);
    if (name.isDirectory()) {
      if (name.name === "node_modules" || name.name === ".git") continue;
      walkHtmlFiles(abs, out);
    } else if (name.name.endsWith(".html")) {
      out.push(abs);
    }
  }
  return out;
}

let updated = 0;
for (const file of walkHtmlFiles(ROOT)) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  if (EXCLUDE.has(rel)) continue;

  let text = fs.readFileSync(file, "utf8");
  if (!text.includes(AFTER) || text.includes(TAG)) continue;

  text = text.replace(AFTER, `${AFTER}\n    ${TAG}`);
  fs.writeFileSync(file, text);
  console.log("updated:", rel);
  updated++;
}

console.log(`\n完成：更新 ${updated} 个 HTML`);
