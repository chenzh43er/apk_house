import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const STATE_COPY_INSERT = {
  de: `                stepsFoot: 'Kostenlos · Ohne Anmeldung · Ca. 2 Minuten',
                stepsCta: 'Bundesländer unten durchsuchen',
                stepsProgressMeta: 'Noch ca. 2 Min.',
                stepDetail: 'Wir zeigen Ihnen Programme und Angebote für bezahlbaren Wohnraum in Ihrem Bundesland.',
                stepPill: 'Aktueller Schritt',`,
  us: `                stepsFoot: 'Free · No sign-up · About 2 minutes',
                stepsCta: 'Browse states below',
                stepsProgressMeta: '~2 min left',
                stepDetail: 'We\\'ll show subsidized housing programs and listings available in your state.',
                stepPill: 'You are here',`,
  'de-ch-at': `                stepsFoot: 'Kostenlos · Ohne Anmeldung · Ca. 2 Minuten',
                stepsCta: 'Kantone unten durchsuchen',
                stepsProgressMeta: 'Noch ca. 2 Min.',
                stepDetail: 'Wir zeigen Ihnen Programme und Angebote für bezahlbaren Wohnraum in Ihrem Kanton.',
                stepPill: 'Aktueller Schritt',`,
};

const CITY_COPY_INSERT = {
  de: `                stepsLabel: 'Schritt 2 von 4',
                stepsTitle: 'Stadt auswählen',
                stepsLead: 'Wählen Sie eine Stadt, um lokale Programme und Angebote zu sehen.',
                stepsFoot: 'Kostenlos · Ohne Anmeldung · Ca. 2 Minuten',
                stepsCta: 'Städte unten durchsuchen',
                stepsProgressMeta: 'Noch ca. 1 Min.',
                stepDetail: 'Wählen Sie eine Stadt, um Angebote in Ihrer Region zu filtern.',
                stepPill: 'Aktueller Schritt',`,
  us: `                stepsLabel: 'Step 2 of 4',
                stepsTitle: 'Select your city',
                stepsLead: 'Choose a city to see local housing programs and listings.',
                stepsFoot: 'Free · No sign-up · About 2 minutes',
                stepsCta: 'Browse cities below',
                stepsProgressMeta: '~1 min left',
                stepDetail: 'Pick a city to filter programs and listings in your area.',
                stepPill: 'You are here',`,
  'de-ch-at': `                stepsLabel: 'Schritt 2 von 4',
                stepsTitle: 'Gemeinde auswählen',
                stepsLead: 'Wählen Sie eine Gemeinde, um lokale Programme und Angebote zu sehen.',
                stepsFoot: 'Kostenlos · Ohne Anmeldung · Ca. 2 Minuten',
                stepsCta: 'Gemeinden unten durchsuchen',
                stepsProgressMeta: 'Noch ca. 1 Min.',
                stepDetail: 'Wählen Sie eine Gemeinde, um Angebote in Ihrer Region zu filtern.',
                stepPill: 'Aktueller Schritt',`,
};

const DISTRICT_COPY_INSERT = {
  de: `                stepsLabel: 'Schritt 3 von 4',
                stepsTitle: 'Bezirk auswählen',
                stepsLead: 'Wählen Sie einen Bezirk, um passende Wohnangebote einzugrenzen.',
                stepsFoot: 'Kostenlos · Ohne Anmeldung · Ca. 2 Minuten',
                stepsCta: 'Bezirke unten durchsuchen',
                stepsProgressMeta: 'Fast geschafft',
                stepDetail: 'Grenzen Sie Ihre Suche auf den passenden Stadtteil ein.',
                stepPill: 'Aktueller Schritt',`,
  us: `                stepsLabel: 'Step 3 of 4',
                stepsTitle: 'Select your district',
                stepsLead: 'Choose a district to browse matching affordable housing listings.',
                stepsFoot: 'Free · No sign-up · About 2 minutes',
                stepsCta: 'Browse districts below',
                stepsProgressMeta: 'Almost there',
                stepDetail: 'Narrow your search to the neighborhood that fits you best.',
                stepPill: 'You are here',`,
  'de-ch-at': `                stepsLabel: 'Schritt 3 von 4',
                stepsTitle: 'Quartier auswählen',
                stepsLead: 'Wählen Sie ein Quartier, um passende Wohnangebote einzugrenzen.',
                stepsFoot: 'Kostenlos · Ohne Anmeldung · Ca. 2 Minuten',
                stepsCta: 'Quartiere unten durchsuchen',
                stepsProgressMeta: 'Fast geschafft',
                stepDetail: 'Grenzen Sie Ihre Suche auf die passende Umgebung ein.',
                stepPill: 'Aktueller Schritt',`,
};

function replaceStepPillBlock(content, inserts) {
  for (const [lang, block] of Object.entries(inserts)) {
    const key = lang === 'de-ch-at' ? "'de-ch-at'" : lang;
    const re = new RegExp(
      `(${key}: \\{[\\s\\S]*?stepsLead: '[^']*',\\r?\\n)\\s*stepPill: '[^']*',`,
      'm'
    );
    content = content.replace(re, `$1${block}\n`);
  }
  return content;
}

function replaceCityStepPillBlock(content, inserts) {
  for (const [lang, block] of Object.entries(inserts)) {
    const key = lang === 'de-ch-at' ? "'de-ch-at'" : lang;
    const re = new RegExp(
      `(${key}: \\{[\\s\\S]*?headChip3: '[^']*',\\r?\\n)\\s*stepPill: '[^']*',`,
      'm'
    );
    content = content.replace(re, `$1${block}\n`);
  }
  return content;
}

function patchStateHints(content) {
  return content
    .replace(
      /state: 'Select state', stateHint: 'Choose your region',\r?\n                city: 'Select city', cityHint: 'Pick a city nearby',/,
      `state: 'Select state', stateHint: 'Programs from $300/mo',
                city: 'Select city', cityHint: 'Tap below — badges show listing counts',`
    )
    .replace(
      /district: 'Select district', districtHint: 'Narrow your area',\r?\n                apartment: 'Select apartment', apartmentHint: 'Browse matching listings',/g,
      `district: 'Select district', districtHint: 'Filter by neighborhood',
                apartment: 'Select apartment', apartmentHint: 'Section 8 · LIHTC · Public housing',`
    );
}

function addChromeCall(content, fnName, step) {
  const marker = `set('lang_apartment_hint', copy.apartmentHint);`;
  const call = `${marker}\r\n        applyPickerStepsChrome(${step}, copy);`;
  if (content.includes(`applyPickerStepsChrome(${step}, copy)`)) return content;
  return content.replace(marker, call);
}

function addCityCtaUpdate(content) {
  if (content.includes('updatePickerStepsCta(lang, 2')) return content;
  return content.replace(
    /document\.getElementById\(['"]select-state['"]\)\.innerHTML = innerStr;/,
    `document.getElementById('select-state').innerHTML = innerStr;\r\n        updatePickerStepsCta(lang, 2, (data || []).length);`
  );
}

function addDistrictCtaUpdate(content) {
  if (content.includes('updatePickerStepsCta(lang, 3')) return content;
  return content.replace(
    /document\.getElementById\(['"]select-state['"]\)\.innerHTML = innerStr;/,
    `document.getElementById('select-state').innerHTML = innerStr;\r\n        updatePickerStepsCta(lang, 3, (data || []).length);`
  );
}

function patchCityHints(content) {
  return content.replace(
    /city: 'Select city', cityHint: 'Pick a city nearby',/,
    `city: 'Select city', cityHint: 'Tap below — badges show listing counts',`
  );
}

function patchDistrictHints(content) {
  return content.replace(
    /district: 'Select district', districtHint: 'Narrow your area',/,
    `district: 'Select district', districtHint: 'Filter by neighborhood',`
  );
}

for (const lang of ['us', 'de', 'de-ch-at']) {
  let state = fs.readFileSync(path.join(root, lang, 'state.html'), 'utf8');
  state = replaceStepPillBlock(state, STATE_COPY_INSERT);
  state = patchStateHints(state);
  state = addChromeCall(state, 'applyStatePageCopy', 1);
  fs.writeFileSync(path.join(root, lang, 'state.html'), state);
  console.log('copy patched', `${lang}/state.html`);

  let city = fs.readFileSync(path.join(root, lang, 'city.html'), 'utf8');
  city = replaceCityStepPillBlock(city, CITY_COPY_INSERT);
  city = patchCityHints(city);
  city = addChromeCall(city, 'applyCityPageCopy', 2);
  city = addCityCtaUpdate(city);
  fs.writeFileSync(path.join(root, lang, 'city.html'), city);
  console.log('copy patched', `${lang}/city.html`);

  let district = fs.readFileSync(path.join(root, lang, 'district.html'), 'utf8');
  district = replaceCityStepPillBlock(district, DISTRICT_COPY_INSERT);
  district = patchDistrictHints(district);
  district = addChromeCall(district, 'applyDistrictPageCopy', 3);
  district = addDistrictCtaUpdate(district);
  fs.writeFileSync(path.join(root, lang, 'district.html'), district);
  console.log('copy patched', `${lang}/district.html`);
}
