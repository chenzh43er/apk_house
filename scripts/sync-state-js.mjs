import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const us = fs.readFileSync(path.join(root, 'us/state.html'), 'utf8');
const start = us.indexOf('function applyStateStepImages');
const end = us.indexOf('document.getElementById("state_adv1").innerHTML = returnAdvWord()', start);
if (start === -1 || end === -1) {
  throw new Error(`us markers not found: ${start} ${end}`);
}
const scriptStart = us.lastIndexOf('<script>', start);
const scriptEnd = us.lastIndexOf('</script>', end);
const newBlock = us.slice(scriptStart, scriptEnd);

for (const f of ['de/state.html', 'de-ch-at/state.html']) {
  const fp = path.join(root, f);
  let c = fs.readFileSync(fp, 'utf8');
  const oldStart = c.indexOf('function selectCountry');
  if (oldStart === -1) throw new Error(`selectCountry not found in ${f}`);
  const oldScriptStart = c.lastIndexOf('<script>', oldStart);
  const oldEnd = c.indexOf('document.getElementById("state_adv1").innerHTML = returnAdvWord()', oldStart);
  if (oldEnd === -1) throw new Error(`state_adv1 marker not found in ${f}`);
  const oldScriptEnd = c.lastIndexOf('</script>', oldEnd);
  c = c.slice(0, oldScriptStart) + newBlock + c.slice(oldScriptEnd);
  fs.writeFileSync(fp, c);
  console.log('patched', f);
}
