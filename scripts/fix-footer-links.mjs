/**
 * Rewrite footer legal links to locale-root absolute paths so they work
 * from clean URLs like /us/teach/state (not only from *.html paths).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const PAGES = ["aboutus.html", "disclaimer.html", "dcma.html", "privacy.html"];

const LOCALE_PREFIX = {
  "": "",
  us: "/us",
  de: "/de",
  "de-ch-at": "/de-ch-at",
};

function getLocaleForFile(relPath) {
  const first = relPath.split(/[/\\]/)[0];
  if (first in LOCALE_PREFIX) return first;
  return "";
}

function fixFooterLinks(content, prefix) {
  let next = content;
  for (const page of PAGES) {
    const absolute = `${prefix}/${page}`;
    next = next.replaceAll(`href="./${page}"`, `href="${absolute}"`);
  }
  return next;
}

function collectHtmlFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "scripts") {
        continue;
      }
      collectHtmlFiles(full, files);
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      files.push(full);
    }
  }
  return files;
}

function main() {
  const files = collectHtmlFiles(ROOT);
  let updated = 0;

  for (const filePath of files) {
    const rel = path.relative(ROOT, filePath);
    const locale = getLocaleForFile(rel);
    const prefix = LOCALE_PREFIX[locale];
    const original = fs.readFileSync(filePath, "utf8");
    const next = fixFooterLinks(original, prefix);
    if (next !== original) {
      fs.writeFileSync(filePath, next, "utf8");
      updated++;
    }
  }

  console.log(`Updated footer links in ${updated} HTML files.`);
}

main();
