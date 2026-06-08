/**
 * Inline header/footer fragments into HTML pages and remove fetch() waterfalls.
 * Preserves per-page post-load logic (lang_index, year, etc.).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const LOCALE_DIRS = ["", "us", "de", "de-ch-at"];
const SKIP_FILES = new Set(["header.html", "footer.html"]);

function extractBodyFragment(filePath) {
  const html = fs.readFileSync(filePath, "utf8");
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return (bodyMatch ? bodyMatch[1] : html).trim();
}

function writeFragment(filePath) {
  const fragment = extractBodyFragment(filePath);
  fs.writeFileSync(filePath, fragment + "\n", "utf8");
  return fragment;
}

function loadFragments(localeDir) {
  const base = localeDir ? path.join(ROOT, localeDir) : ROOT;
  const headerPath = path.join(base, "header.html");
  const footerPath = path.join(base, "footer.html");
  if (!fs.existsSync(headerPath) || !fs.existsSync(footerPath)) {
    return null;
  }
  return {
    header: writeFragment(headerPath),
    footer: writeFragment(footerPath),
  };
}

function getLocaleForFile(relPath) {
  const first = relPath.split(/[/\\]/)[0];
  if (first === "us" || first === "de" || first === "de-ch-at") return first;
  return "";
}

function extractBraced(content, braceStart) {
  let depth = 0;
  for (let j = braceStart; j < content.length; j++) {
    if (content[j] === "{") depth++;
    else if (content[j] === "}") {
      depth--;
      if (depth === 0) {
        return { body: content.slice(braceStart + 1, j), end: j + 1 };
      }
    }
  }
  return null;
}

function skipThenCall(content, fromIndex) {
  const thenPos = content.indexOf(".then", fromIndex);
  if (thenPos === -1) return null;
  let i = thenPos + 5;
  while (i < content.length && /\s/.test(content[i])) i++;
  if (content[i] !== "(") return null;
  i++;
  let depth = 1;
  while (i < content.length && depth > 0) {
    if (content[i] === "(") depth++;
    else if (content[i] === ")") depth--;
    i++;
  }
  return i;
}

function parseHeaderFooterFetch(content, fetchIdx) {
  const closeFetch = content.indexOf(")", fetchIdx);
  if (closeFetch === -1) return null;

  let i = skipThenCall(content, closeFetch + 1);
  if (i == null) return null;
  i = skipThenCall(content, i);
  if (i == null) return null;

  const then2 = content.lastIndexOf(".then", i - 1);
  let pos = then2 + 5;
  while (pos < content.length && /\s/.test(content[pos])) pos++;
  if (content[pos] !== "(") return null;
  pos++;
  while (pos < content.length && /\s/.test(content[pos])) pos++;

  let body;
  let end;

  if (content.startsWith("function", pos)) {
    const brace = content.indexOf("{", pos);
    const braced = extractBraced(content, brace);
    if (!braced) return null;
    body = braced.body;
    end = braced.end;
    while (end < content.length && /\s/.test(content[end])) end++;
    if (content[end] === ")") end++;
  } else {
    const arrow = content.indexOf("=>", pos);
    if (arrow === -1) return null;
    let afterArrow = arrow + 2;
    while (afterArrow < content.length && /\s/.test(content[afterArrow])) afterArrow++;
    if (content[afterArrow] === "{") {
      const braced = extractBraced(content, afterArrow);
      if (!braced) return null;
      body = braced.body;
      end = braced.end;
      while (end < content.length && /\s/.test(content[end])) end++;
      if (content[end] === ")") end++;
    } else {
      return null;
    }
  }

  while (end < content.length && /[\s;]/.test(content[end])) end++;
  return { body, end };
}

function findRemoveStart(content, fetchIdx) {
  let removeStart = fetchIdx;
  let lineStart = content.lastIndexOf("\n", fetchIdx - 1);
  if (lineStart === -1) lineStart = 0;
  else lineStart += 1;

  const beforeOnLine = content.slice(lineStart, fetchIdx);
  if (/^\s*$/.test(beforeOnLine) && lineStart > 0) {
    const prevEnd = lineStart - 1;
    const prevStart = content.lastIndexOf("\n", prevEnd - 1) + 1;
    const prevLine = content.slice(prevStart, prevEnd);
    if (/^\s*\/\/\s*加载\s+(header|footer)/i.test(prevLine)) {
      removeStart = prevStart;
    }
  }
  return removeStart;
}

function removeFetchBlock(content, url) {
  const patterns = [`fetch('${url}')`, `fetch("${url}")`];

  for (const pat of patterns) {
    let searchFrom = 0;
    while (searchFrom < content.length) {
      const idx = content.indexOf(pat, searchFrom);
      if (idx === -1) break;

      const parsed = parseHeaderFooterFetch(content, idx);
      if (!parsed) {
        searchFrom = idx + pat.length;
        continue;
      }

      const removeStart = findRemoveStart(content, idx);
      const body = parsed.body
        .replace(
          /document\.getElementById\(['"](?:header|footer)['"]\)\.innerHTML\s*=\s*data\s*;?/g,
          ""
        )
        .trim();

      const replacement = body ? body + "\n\n" : "";
      content = content.slice(0, removeStart) + replacement + content.slice(parsed.end);
      searchFrom = removeStart + replacement.length;
    }
  }

  return content;
}

function inlineTags(content, headerFrag, footerFrag) {
  if (content.includes("fetch('./header.html')") || content.includes('fetch("./header.html")')) {
    content = content.replace(
      /(<header\b[^>]*\bid\s*=\s*["']header["'][^>]*>)\s*(<\/header>)/i,
      `$1\n${headerFrag}\n$2`
    );
  }

  if (content.includes("fetch('./footer.html')") || content.includes('fetch("./footer.html")')) {
    content = content.replace(
      /(<footer\b[^>]*\bid\s*=\s*["']footer["'][^>]*>)\s*(<\/footer>)/i,
      `$1\n${footerFrag}\n$2`
    );
  }

  return content;
}

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

function processFile(filePath, fragmentsByLocale) {
  const rel = path.relative(ROOT, filePath);
  const locale = getLocaleForFile(rel);
  const fragments = fragmentsByLocale[locale];
  if (!fragments) return { filePath, changed: false, reason: "no fragments" };

  let content = fs.readFileSync(filePath, "utf8");
  if (!content.includes("fetch('./header.html')") && !content.includes('fetch("./header.html")')) {
    if (!content.includes("fetch('./footer.html')") && !content.includes('fetch("./footer.html")')) {
      return { filePath, changed: false, reason: "no fetch" };
    }
  }

  const original = content;
  content = inlineTags(content, fragments.header, fragments.footer);
  content = removeFetchBlock(content, "./header.html");
  content = removeFetchBlock(content, "./footer.html");

  if (content !== original) {
    fs.writeFileSync(filePath, content, "utf8");
    return { filePath, changed: true };
  }
  return { filePath, changed: false, reason: "unchanged" };
}

function main() {
  const fragmentsByLocale = {};
  for (const locale of LOCALE_DIRS) {
    const frags = loadFragments(locale);
    if (frags) fragmentsByLocale[locale] = frags;
  }

  const files = collectHtmlFiles(ROOT);
  const results = files.map((f) => processFile(f, fragmentsByLocale));
  const changed = results.filter((r) => r.changed);

  console.log(`Processed ${files.length} HTML files, updated ${changed.length}.`);
  for (const r of changed) {
    console.log(`  updated: ${path.relative(ROOT, r.filePath)}`);
  }
}

main();
