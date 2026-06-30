/**
 * Sync header/footer fragment HTML into all locale HTML pages.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const LOCALE_DIRS = ["", "us", "de", "de-ch-at"];
const SKIP_FILES = new Set(["header.html", "footer.html"]);

/**
 * @param {string} filePath
 * @returns {string}
 */
function readFragment(filePath) {
  return fs.readFileSync(filePath, "utf8").trim();
}

/**
 * @param {string} relPath
 * @returns {string}
 */
function getLocaleForFile(relPath) {
  const first = relPath.split(/[/\\]/)[0];
  if (first === "us" || first === "de" || first === "de-ch-at") return first;
  return "";
}

/**
 * @param {string} content
 * @param {string} tag
 * @param {string} fragment
 * @returns {string}
 */
function replaceTagInner(content, tag, fragment) {
  const re = new RegExp(
    `(<${tag}\\b[^>]*\\bid\\s*=\\s*["']${tag}["'][^>]*>)([\\s\\S]*?)(<\\/${tag}>)`,
    "gi"
  );
  return content.replace(re, `$1\n${fragment}\n$3`);
}

/**
 * @param {string} dir
 * @param {string[]} files
 * @returns {string[]}
 */
function collectHtmlFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "scripts") {
        continue;
      }
      collectHtmlFiles(full, files);
    } else if (entry.isFile() && entry.name.endsWith(".html") && !SKIP_FILES.has(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function main() {
  /** @type {Record<string, { header: string, footer: string }>} */
  const fragmentsByLocale = {};

  for (const locale of LOCALE_DIRS) {
    const base = locale ? path.join(ROOT, locale) : ROOT;
    const headerPath = path.join(base, "header.html");
    const footerPath = path.join(base, "footer.html");
    if (!fs.existsSync(headerPath) || !fs.existsSync(footerPath)) continue;
    fragmentsByLocale[locale] = {
      header: readFragment(headerPath),
      footer: readFragment(footerPath),
    };
  }

  const files = collectHtmlFiles(ROOT);
  let updated = 0;

  for (const filePath of files) {
    const rel = path.relative(ROOT, filePath);
    const locale = getLocaleForFile(rel);
    const fragments = fragmentsByLocale[locale];
    if (!fragments) continue;

    const original = fs.readFileSync(filePath, "utf8");
    let content = original;
    content = replaceTagInner(content, "header", fragments.header);
    content = replaceTagInner(content, "footer", fragments.footer);

    if (content !== original) {
      fs.writeFileSync(filePath, content, "utf8");
      updated++;
      console.log(`  updated: ${rel}`);
    }
  }

  console.log(`Synced header/footer in ${updated} HTML files.`);
}

main();
