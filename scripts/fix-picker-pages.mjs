import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function removeLegacyCopyScripts(content) {
  const legacyMarker = 'document.getElementById("lang_how2").innerHTML';
  while (content.includes(legacyMarker)) {
    const idx = content.indexOf(legacyMarker);
    const scriptStart = content.lastIndexOf('<script>', idx);
    const scriptEnd = content.indexOf('</script>', idx) + '</script>'.length;
    content = content.slice(0, scriptStart) + content.slice(scriptEnd);
  }
  return content;
}

function fixCityModule(content) {
  if (!content.includes('const lang = getLangFromPath();') || !content.includes('fetchCitiesByState')) {
    content = content.replace(
      '<script type="module">\n    const params = new URLSearchParams(window.location.search);',
      '<script type="module">\n    const lang = getLangFromPath();\n    const params = new URLSearchParams(window.location.search);'
    );
  }
  content = content.replace(
    `    $(document).ready(function () {

        const params = new URLSearchParams(window.location.search);
        const country = params.get('country');
        applyCityPageCopy(lang, display_state);`,
    `    $(document).ready(function () {
        applyCityPageCopy(lang, display_state);`
  );
  content = content.replace(
    `        // 如果没有参数，再从 /xx/Alabama/city 或 /xx/Baden-Württemberg/city 这种路径提取
        const match = url.pathname.match(/\\/([^/]+)\\/city$/);
        if (match) {
            return decodeURIComponent(match[1]); // 解码 URL 编码
        }`,
    `        const regex = /^\\/(?:(?:de|de-ch-at)(?:\\/teach\\/state)?|us\\/teach\\/state)\\/([^/]+)(?:\\/city)?\\/?$/i;
        const match = url.pathname.match(regex);
        if (match) {
            return decodeURIComponent(match[1]);
        }`
  );
  return content;
}

function fixDistrictModule(content) {
  content = content.replace(
    `    const params = new URLSearchParams(window.location.search);
    // const display_state = params.get('state');
    // const display_city = params.get('city');
    const { state: display_state, city: display_city } = getStateAndCityFromUrl();

    const params = new URLSearchParams(window.location.search);
    const country = params.get('country');
    applyDistrictPageCopy(lang, display_state, display_city);
    applyStateStepImages(lang, country);

    const {data, error} = await fetchDistrictsByCity(display_city);`,
    `    const { state: display_state, city: display_city } = getStateAndCityFromUrl();
    applyDistrictPageCopy(lang, display_state, display_city);
    applyStateStepImages(lang, country);

    const {data, error} = await fetchDistrictsByCity(display_city);`
  );
  return content;
}

for (const lang of ['us', 'de', 'de-ch-at']) {
  for (const page of ['city', 'district']) {
    const fp = path.join(root, lang, `${page}.html`);
    let content = fs.readFileSync(fp, 'utf8');
    content = removeLegacyCopyScripts(content);
    if (page === 'city') content = fixCityModule(content);
    if (page === 'district') content = fixDistrictModule(content);
    fs.writeFileSync(fp, content);
    console.log('fixed', `${lang}/${page}.html`);
  }
}
