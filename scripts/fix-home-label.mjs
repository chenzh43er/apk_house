import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".wrangler") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile() && entry.name.endsWith(".html")) files.push(full);
  }
  return files;
}

let count = 0;
for (const file of walk(ROOT)) {
  const original = fs.readFileSync(file, "utf8");
  const updated = original
    .replace(/innerText="HOME"/g, 'innerText="Home"')
    .replace(/: 'HOME'/g, ": 'Home'");
  if (updated !== original) {
    fs.writeFileSync(file, updated, "utf8");
    count++;
  }
}
console.log(`Updated ${count} files.`);
