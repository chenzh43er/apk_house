/**
 * 将 lang_index 的 innerText 赋值改为仅更新 .nav-item-text，避免破坏移动端菜单结构。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const RE = /document\.getElementById\("lang_index"\)\.innerText\s*=\s*"([^"]+)"/g;

/**
 * @param {string} content
 * @returns {string}
 */
function patchContent(content) {
  if (!RE.test(content)) return content;
  RE.lastIndex = 0;
  return content.replace(
    RE,
    '(function(_e,_t){var _n=_e&&_e.querySelector(".nav-item-text");if(_n){_n.textContent=_t}else if(_e){_e.innerText=_t}})(document.getElementById("lang_index"),"$1")'
  );
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
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      files.push(full);
    }
  }
  return files;
}

function main() {
  let updated = 0;
  for (const filePath of collectHtmlFiles(ROOT)) {
    const original = fs.readFileSync(filePath, "utf8");
    const next = patchContent(original);
    if (next !== original) {
      fs.writeFileSync(filePath, next, "utf8");
      updated += 1;
      console.log("  updated:", path.relative(ROOT, filePath));
    }
  }
  console.log(`Patched lang_index script in ${updated} HTML files.`);
}

main();
