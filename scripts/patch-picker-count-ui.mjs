import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const pickerLeads = {
  state: {
    de: 'Tippen Sie auf ein Bundesland – die Badge zeigt die Anzahl verfügbarer Angebote.',
    us: 'Tap a state below — the badge shows how many listings are available.',
    'de-ch-at': 'Tippen Sie auf einen Kanton – die Badge zeigt die Anzahl verfügbarer Angebote.'
  },
  city: {
    de: 'Tippen Sie auf eine Stadt – die Badge zeigt die Anzahl verfügbarer Angebote.',
    us: 'Tap a city below — the badge shows how many listings are available.',
    'de-ch-at': 'Tippen Sie auf eine Gemeinde – die Badge zeigt die Anzahl verfügbarer Angebote.'
  },
  district: {
    de: 'Tippen Sie auf einen Bezirk – die Badge zeigt die Anzahl verfügbarer Angebote.',
    us: 'Tap a district below — the badge shows how many listings are available.',
    'de-ch-at': 'Tippen Sie auf ein Quartier – die Badge zeigt die Anzahl verfügbarer Angebote.'
  }
};

function patchLegend(html) {
  if (html.includes('state_picker_legend')) return html;
  return html.replace(
    /(<p class="state-picker-lead" id="state_picker_lead">[\s\S]*?<\/p>)/,
    '$1\n                <p class="state-picker-legend" id="state_picker_legend" aria-hidden="true"></p>'
  );
}

function patchPickerLeads(html, pageType) {
  const replacements = {
    state: [
      ["pickerLead: 'Tippen Sie auf ein Bundesland, um verfügbare Wohnprogramme zu sehen.'", `pickerLead: '${pickerLeads.state.de}'`],
      ["pickerLead: 'Tap a state below to see available housing programs.'", `pickerLead: '${pickerLeads.state.us}'`],
      ["pickerLead: 'Tippen Sie auf einen Kanton, um verfügbare Wohnprogramme zu sehen.'", `pickerLead: '${pickerLeads.state['de-ch-at']}'`]
    ],
    city: [
      ["pickerLead: 'Tippen Sie auf eine Stadt, um verfügbare Wohnprogramme zu sehen.'", `pickerLead: '${pickerLeads.city.de}'`],
      ["pickerLead: 'Tap a city below to see available housing programs.'", `pickerLead: '${pickerLeads.city.us}'`],
      ["pickerLead: 'Tippen Sie auf eine Gemeinde, um verfügbare Wohnprogramme zu sehen.'", `pickerLead: '${pickerLeads.city['de-ch-at']}'`]
    ],
    district: [
      ["pickerLead: 'Tippen Sie auf einen Bezirk, um verfügbare Angebote zu sehen.'", `pickerLead: '${pickerLeads.district.de}'`],
      ["pickerLead: 'Tap a district below to see available listings.'", `pickerLead: '${pickerLeads.district.us}'`],
      ["pickerLead: 'Tippen Sie auf ein Quartier, um verfügbare Angebote zu sehen.'", `pickerLead: '${pickerLeads.district['de-ch-at']}'`]
    ]
  };

  for (const [oldStr, newStr] of replacements[pageType]) {
    html = html.split(oldStr).join(newStr);
  }
  return html;
}

function patchLegendCall(html) {
  if (html.includes('applyPickerCountLegend(lang)')) return html;
  return html.replace(
    /(set\('state_picker_lead', copy\.pickerLead\);)/,
    "$1\n        applyPickerCountLegend(lang);"
  );
}

function patchStateModule(html) {
  return html
    .replace(
      `    const { data, error } = await  fetchDistinctStates();
    const dataWithCounts = await attachStateHouseCounts(data || []);

    $(document).ready(function() {
        let innerStr = '';
        dataWithCounts.forEach((item,index) => {
            innerStr += \`<li>
                <a href="./city.html?state=\${item.display_state}" class="state-link"><span class="state-tile selectLidiv"><span class="state-tile__text text-wrapper">\${item.display_state}</span><span class="state-tile__count">\${item.house_count ?? 0}</span></span></a>
                </li>\`;`,
      `    const { data, error } = await  fetchDistinctStates();
    const items = data || [];

    $(document).ready(function() {
        let innerStr = '';
        items.forEach((item,index) => {
            innerStr += \`<li>
                <a href="./city.html?state=\${item.display_state}" class="state-link" data-picker-key="\${encodeURIComponent(item.display_state)}">\${buildPickerTileHtml(item.display_state, null, lang)}</a>
                </li>\`;`
    )
    .replace(
      `        document.body.style.display = "block";

        const observer = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    loadState_adv3(entry.target);`,
      `        document.body.style.display = "block";

        attachStateHouseCounts(items).then(function (dataWithCounts) {
            dataWithCounts.forEach(function (item) {
                const link = document.querySelector('.state-link[data-picker-key="' + encodeURIComponent(item.display_state) + '"]');
                updatePickerTileCount(link, item.house_count, lang);
            });
        });

        const observer = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    loadState_adv3(entry.target);`
    );
}

function patchCityModule(html) {
  return html
    .replace(
      `    const {data, error} = await fetchCitiesByState(display_state);
    const dataWithCounts = await attachCityHouseCounts(display_state, data || []);

    $(document).ready(function () {
        applyCityPageCopy(lang, display_state);
        applyStateStepImages(lang, country);

        let innerStr = '';
        dataWithCounts.forEach((item,index)  => {`,
      `    const {data, error} = await fetchCitiesByState(display_state);
    const items = data || [];

    $(document).ready(function () {
        applyCityPageCopy(lang, display_state);
        applyStateStepImages(lang, country);

        let innerStr = '';
        items.forEach((item,index)  => {`
    )
    .replace(
      `                innerStr += \`<li>
                <a href="\${link_href}" class="state-link"><span class="state-tile selectLidiv"><span class="state-tile__text text-wrapper">\${item.display_city}</span><span class="state-tile__count">\${item.house_count ?? 0}</span></span></a>
                </li>\`;`,
      `                innerStr += \`<li>
                <a href="\${link_href}" class="state-link" data-picker-key="\${encodeURIComponent(item.display_city)}">\${buildPickerTileHtml(item.display_city, null, lang)}</a>
                </li>\`;`
    )
    .replace(
      `        document.getElementById('select-state').innerHTML = innerStr;
        document.body.style.display = "block";

        const observer = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    loadCity_adv3(entry.target);`,
      `        document.getElementById('select-state').innerHTML = innerStr;
        document.body.style.display = "block";

        attachCityHouseCounts(display_state, items).then(function (dataWithCounts) {
            dataWithCounts.forEach(function (item) {
                const link = document.querySelector('.state-link[data-picker-key="' + encodeURIComponent(item.display_city) + '"]');
                updatePickerTileCount(link, item.house_count, lang);
            });
        });

        const observer = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    loadCity_adv3(entry.target);`
    );
}

function patchDistrictModule(html) {
  return html
    .replace(
      `    const {data, error} = await fetchDistrictsByCity(display_city);
    const dataWithCounts = await attachDistrictHouseCounts(display_state, display_city, data || []);

    $(document).ready(function () {

        let innerStr = '';
        dataWithCounts.forEach((item,index) => {`,
      `    const {data, error} = await fetchDistrictsByCity(display_city);
    const items = data || [];

    $(document).ready(function () {

        let innerStr = '';
        items.forEach((item,index) => {`
    )
    .replace(
      `            innerStr += \`<li>
                    <a href="\${link_href}" class="state-link"><span class="state-tile selectLidiv"><span class="state-tile__text text-wrapper">\${item.display_district}</span><span class="state-tile__count">\${item.house_count ?? 0}</span></span></a>
                </li>\`;`,
      `            innerStr += \`<li>
                    <a href="\${link_href}" class="state-link" data-picker-key="\${encodeURIComponent(item.display_district)}">\${buildPickerTileHtml(item.display_district, null, lang)}</a>
                </li>\`;`
    )
    .replace(
      `        document.getElementById('select-state').innerHTML = innerStr;
        document.body.style.display = "block";

        const observer = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    loadDistrict_adv3(entry.target);`,
      `        document.getElementById('select-state').innerHTML = innerStr;
        document.body.style.display = "block";

        attachDistrictHouseCounts(display_state, display_city, items).then(function (dataWithCounts) {
            dataWithCounts.forEach(function (item) {
                const link = document.querySelector('.state-link[data-picker-key="' + encodeURIComponent(item.display_district) + '"]');
                updatePickerTileCount(link, item.house_count, lang);
            });
        });

        const observer = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    loadDistrict_adv3(entry.target);`
    );
}

const files = [];
for (const locale of ['us', 'de', 'de-ch-at']) {
  files.push(['state', `${locale}/state.html`]);
  files.push(['city', `${locale}/city.html`]);
  files.push(['district', `${locale}/district.html`]);
}

for (const [type, rel] of files) {
  const fp = path.join(root, rel);
  let html = fs.readFileSync(fp, 'utf8');
  const before = html;
  html = patchLegend(html);
  html = patchPickerLeads(html, type);
  html = patchLegendCall(html);
  if (type === 'state') html = patchStateModule(html);
  if (type === 'city') html = patchCityModule(html);
  if (type === 'district') html = patchDistrictModule(html);
  if (html === before) {
    console.warn('NO CHANGE', rel);
  } else {
    fs.writeFileSync(fp, html);
    console.log('patched', rel);
  }
}
