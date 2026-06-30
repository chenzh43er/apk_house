import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

const REPLACEMENTS = [
  ['./Public/Js/ad-config.js', '/Public/Js/ad-config.js'],
  ['./Public/Js/ad-slots-adx.js', '/Public/Js/ad-slots-adx.js'],
  ['./Public/Js/ad-loader.js', '/Public/Js/ad-loader.js'],
  ['./Public/Js/ad-runtime.js', '/Public/Js/ad-runtime.js'],
];

const DUPLICATE_FILES = [
  'us/Public/Js/ad-config.js',
  'us/Public/Js/ad-slots-adx.js',
  'us/Public/Js/ad-loader.js',
  'us/Public/Js/ad-runtime.js',
  'de/Public/Js/ad-config.js',
  'de/Public/Js/ad-slots-adx.js',
  'de/Public/Js/ad-loader.js',
  'de/Public/Js/ad-runtime.js',
  'de-ch-at/Public/Js/ad-config.js',
  'de-ch-at/Public/Js/ad-slots-adx.js',
  'de-ch-at/Public/Js/ad-loader.js',
  'de-ch-at/Public/Js/ad-runtime.js',
];

function walkHtmlFiles(dir, out = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, name.name);
    if (name.isDirectory()) {
      if (name.name === 'node_modules' || name.name === '.git') continue;
      walkHtmlFiles(abs, out);
    } else if (name.name.endsWith('.html')) {
      out.push(abs);
    }
  }
  return out;
}

let htmlUpdated = 0;
for (const file of walkHtmlFiles(ROOT)) {
  let text = fs.readFileSync(file, 'utf8');
  let changed = false;
  for (const [from, to] of REPLACEMENTS) {
    if (text.includes(from)) {
      text = text.split(from).join(to);
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(file, text);
    htmlUpdated++;
    console.log('html:', path.relative(ROOT, file));
  }
}

let deleted = 0;
for (const rel of DUPLICATE_FILES) {
  const file = path.join(ROOT, rel);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    deleted++;
    console.log('deleted:', rel);
  }
}

console.log(`\n完成：更新 ${htmlUpdated} 个 HTML，删除 ${deleted} 个重复 JS`);
