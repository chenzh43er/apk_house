import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const root = join(import.meta.dirname, '..');
const regions = ['us', 'de', 'de-ch-at'];
const pages = ['aboutus', 'disclaimer', 'dcma', 'privacy'];

for (const region of regions) {
  for (const page of pages) {
    const file = join(root, region, `${page}.html`);
    let html = readFileSync(file, 'utf8');
    html = html.replace(/href="\.\/Public\/Css\/layout-shell\.css"/g, 'href="/Public/Css/layout-shell.css"');
    html = html.replace(/href="\.\/Public\/Css\/legal-pages\.css"/g, 'href="/Public/Css/legal-pages.css"');
    html = html.replace(
      /<link type="text\/css" rel="stylesheet" href="\/Public\/Css\/legal-pages\.css">/g,
      '  <link rel="stylesheet" href="/Public/Css/legal-pages.css">'
    );
    writeFileSync(file, html, 'utf8');
    console.log('fixed', file);
  }
}
