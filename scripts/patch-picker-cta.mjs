import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

for (const [page, step] of [
  ['city', 2],
  ['district', 3],
]) {
  for (const lang of ['us', 'de', 'de-ch-at']) {
    const fp = path.join(root, lang, `${page}.html`);
    let content = fs.readFileSync(fp, 'utf8');
    if (content.includes(`updatePickerStepsCta(lang, ${step}`)) continue;
    content = content.replace(
      /document\.getElementById\(['"]select-state['"]\)\.innerHTML = innerStr;/,
      `document.getElementById('select-state').innerHTML = innerStr;\r\n        updatePickerStepsCta(lang, ${step}, (data || []).length);`
    );
    fs.writeFileSync(fp, content);
    console.log('cta patched', `${lang}/${page}.html`);
  }
}
