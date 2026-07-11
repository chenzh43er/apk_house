import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const langs = ['us', 'de', 'de-ch-at'];
const pages = ['state', 'city', 'district'];

const FOOT_SVG =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7"/></svg>';

function stepLi(classes, opts) {
  const pill = opts.pill
    ? `\n                            <span class="teach-step__pill" id="lang_step_pill">You are here</span>`
    : '';
  const imgId = opts.imgId ? ` id="${opts.imgId}"` : '';
  const imgClass = opts.svg ? 'teach-step__img teach-step__img--svg' : 'teach-step__img';
  const detail = opts.detail
    ? `\n                            <p class="teach-step__detail" id="lang_step_detail"></p>`
    : '';
  return `                <li class="select-box ${classes} teach-step" role="listitem">
                    <article class="step_box teach-step__card">
                        <div class="teach-step__head">
                            <span class="prog teach-step__num" aria-hidden="true"></span>${pill}
                        </div>
                        <div class="teach-step__icon">
                            <img${imgId} class="${imgClass}" src="${opts.src}" alt="${opts.alt}">
                        </div>
                        <div class="teach-step__copy">
                            <p class="h4 teach-step__text" id="${opts.textId}"></p>
                            <span class="teach-step__hint" id="${opts.hintId}"></span>${detail}
                        </div>
                    </article>
                </li>`;
}

function stepsCard(step, steps) {
  return `        <div class="teach-steps-card state-steps-card" data-current-step="${step}">
            <header class="teach-steps-head">
                <div class="teach-steps-head__body">
                    <span class="teach-steps-label" id="lang_steps_label">Step ${step} of 4</span>
                    <h2 class="teach-steps-title" id="lang_steps_title"></h2>
                    <p class="teach-steps-lead" id="lang_steps_lead"></p>
                </div>
            </header>
            <div class="state-steps-progress" id="lang_steps_progress" role="progressbar" aria-valuemin="1" aria-valuemax="4" aria-valuenow="${step}" aria-labelledby="lang_steps_label">
                <div class="state-steps-progress__track">
                    <div class="state-steps-progress__fill"></div>
                </div>
                <p class="state-steps-progress__meta" id="lang_steps_progress_meta"></p>
            </div>
            <ol class="select-text teach-steps teach-steps-flow" role="list">
${steps.join('\n')}
            </ol>
            <p class="state-steps-current-detail" id="lang_step_detail_bar"></p>
            <div class="teach-steps-foot">
                <p class="teach-steps-foot__note" id="lang_steps_foot"></p>
                <span class="teach-steps-foot__btn teach-steps-foot__btn--static" id="state_steps_cta">
                    <span id="lang_steps_cta"></span>
                    ${FOOT_SVG}
                </span>
            </div>
        </div>`;
}

const STATE_STEPS = stepsCard('1', [
  stepLi('select-now', {
    pill: true,
    imgId: 'conPic',
    src: '',
    alt: 'Country',
    textId: 'lang_state',
    hintId: 'lang_state_hint',
    detail: true,
  }),
  stepLi('select-after', {
    imgId: 'statePic',
    src: '',
    alt: 'State',
    textId: 'lang_city',
    hintId: 'lang_city_hint',
  }),
  stepLi('select-after', {
    svg: true,
    src: '/Public/Images/teach/step-city.svg',
    alt: 'City',
    textId: 'lang_district',
    hintId: 'lang_district_hint',
  }),
  stepLi('select-after', {
    svg: true,
    src: '/Public/Images/teach/step-listings.svg',
    alt: 'Apartment',
    textId: 'lang_apartment',
    hintId: 'lang_apartment_hint',
  }),
]);

const CITY_STEPS = stepsCard('2', [
  stepLi('select-done select-after', {
    imgId: 'conPic',
    src: '',
    alt: 'Country',
    textId: 'lang_state',
    hintId: 'lang_state_hint',
  }),
  stepLi('select-now', {
    pill: true,
    imgId: 'statePic',
    src: '',
    alt: 'State',
    textId: 'lang_city',
    hintId: 'lang_city_hint',
    detail: true,
  }),
  stepLi('select-after', {
    svg: true,
    src: '/Public/Images/teach/step-city.svg',
    alt: 'District',
    textId: 'lang_district',
    hintId: 'lang_district_hint',
  }),
  stepLi('select-after', {
    svg: true,
    src: '/Public/Images/teach/step-listings.svg',
    alt: 'Apartment',
    textId: 'lang_apartment',
    hintId: 'lang_apartment_hint',
  }),
]);

const DISTRICT_STEPS = stepsCard('3', [
  stepLi('select-done select-after', {
    imgId: 'conPic',
    src: '',
    alt: 'Country',
    textId: 'lang_state',
    hintId: 'lang_state_hint',
  }),
  stepLi('select-done select-after', {
    imgId: 'statePic',
    src: '',
    alt: 'City',
    textId: 'lang_city',
    hintId: 'lang_city_hint',
  }),
  stepLi('select-now', {
    pill: true,
    svg: true,
    src: '/Public/Images/teach/step-city.svg',
    alt: 'District',
    textId: 'lang_district',
    hintId: 'lang_district_hint',
    detail: true,
  }),
  stepLi('select-after', {
    svg: true,
    src: '/Public/Images/teach/step-listings.svg',
    alt: 'Apartment',
    textId: 'lang_apartment',
    hintId: 'lang_apartment_hint',
  }),
]);

const CARD_BY_PAGE = { state: STATE_STEPS, city: CITY_STEPS, district: DISTRICT_STEPS };

function replaceStepsCard(content, page) {
  const cardRe =
    /        <div class="teach-steps-card state-steps-card">[\s\S]*?        <\/div>\r?\n\r?\n        (?:<div class="adswp state-ad state-ad--mid" id="state_adv_mid"><\/div>\r?\n\r?\n        )?<div class="state-picker-card">/;
  const replacement = `${CARD_BY_PAGE[page]}\r\n\r\n        ${page === 'state' ? '<div class="adswp state-ad state-ad--mid" id="state_adv_mid"></div>\r\n\r\n        ' : ''}<div class="state-picker-card" id="state-picker-card">`;
  if (!cardRe.test(content)) {
    throw new Error(`steps card block not found in ${page}`);
  }
  return content.replace(cardRe, replacement);
}

function patchApplyStatePageCopy(content) {
  if (content.includes('applyPickerStepsChrome(1, copy)')) return content;

  const insertFields = `
                stepsFoot: 'Kostenlos · Ohne Anmeldung · Ca. 2 Minuten',
                stepsCta: 'Bundesländer unten durchsuchen',
                stepsProgressMeta: 'Noch ca. 2 Min.',
                stepDetail: 'Wir zeigen Ihnen Programme und Angebote für bezahlbaren Wohnraum in Ihrem Bundesland.',`;

  // de block - after stepsLead line
  content = content.replace(
    /(de: \{[\s\S]*?stepsLead: '[^']+',)\n(\s+stepPill:)/,
    `$1${insertFields}\n                stateHint: 'Programme ab 300 € / Monat',\n$2`
  );

  const usFields = `
                stepsFoot: 'Free · No sign-up · About 2 minutes',
                stepsCta: 'Browse states below',
                stepsProgressMeta: '~2 min left',
                stepDetail: 'We\\'ll show subsidized housing programs and listings available in your state.',`;

  content = content.replace(
    /(us: \{[\s\S]*?stepsLead: '[^']+',)\n(\s+stepPill:)/,
    `$1${usFields}\n                stateHint: 'Programs from $300/mo',\n$2`
  );

  const chFields = `
                stepsFoot: 'Kostenlos · Ohne Anmeldung · Ca. 2 Minuten',
                stepsCta: 'Kantone unten durchsuchen',
                stepsProgressMeta: 'Noch ca. 2 Min.',
                stepDetail: 'Wir zeigen Ihnen Programme und Angebote für bezahlbaren Wohnraum in Ihrem Kanton.',`;

  content = content.replace(
    /('de-ch-at': \{[\s\S]*?stepsLead: '[^']+',)\n(\s+stepPill:)/,
    `$1${chFields}\n                stateHint: 'Programme ab 300 € / Monat',\n$2`
  );

  // Remove duplicate stateHint if we added before stepPill but old stateHint exists later
  content = content.replace(
    /(stateHint: '[^']+',\n)(\s+stateHint: '[^']+',)/g,
    '$1'
  );

  // Update hints for city/district/apartment in us block
  content = content.replace(
    /(us: \{[\s\S]*?stateHint: 'Programs from \$300\/mo',\n\s+stepPill:[\s\S]*?state: 'Select state', stateHint: 'Choose your region',)/,
    `$1`.replace("stateHint: 'Choose your region'", "state: 'Select state'").replace(/state: 'Select state', state: 'Select state'/, "state: 'Select state'")
  );

  // Fix duplicate state lines - simpler approach: replace hint strings in applyStatePageCopy only
  content = content.replace(
    /state: 'Select state', stateHint: 'Choose your region',\n                city: 'Select city', cityHint: 'Pick a city nearby',/,
    `state: 'Select state',
                city: 'Select city', cityHint: 'Tap below — badges show listing counts',`
  );
  content = content.replace(
    /district: 'Select district', districtHint: 'Narrow your area',\n                apartment: 'Select apartment', apartmentHint: 'Browse matching listings',/g,
    `district: 'Select district', districtHint: 'Filter by neighborhood',
                apartment: 'Select apartment', apartmentHint: 'Section 8 · LIHTC · Public housing',`
  );

  content = content.replace(
    /set\('lang_apartment_hint', copy\.apartmentHint\);\n    \}/,
    `set('lang_apartment_hint', copy.apartmentHint);
        applyPickerStepsChrome(1, copy);
    }`
  );

  content = content.replace(
    /applyPickerCountLegend\(lang, sumHouseCounts\(dataWithCounts\)\);/,
    `applyPickerCountLegend(lang, sumHouseCounts(dataWithCounts));
            updatePickerStepsCta(lang, 1, (data || []).length);`
  );

  return content;
}

function patchApplyCityPageCopy(content) {
  if (content.includes('applyPickerStepsChrome(2, copy)')) return content;

  const cityExtra = `
                stepsLabel: 'Schritt 2 von 4',
                stepsTitle: 'Stadt auswählen',
                stepsLead: 'Wählen Sie eine Stadt, um lokale Programme und Angebote zu sehen.',
                stepsFoot: 'Kostenlos · Ohne Anmeldung · Ca. 2 Minuten',
                stepsCta: 'Städte unten durchsuchen',
                stepsProgressMeta: 'Noch ca. 1 Min.',
                stepDetail: 'Wählen Sie eine Stadt, um Angebote in Ihrer Region zu filtern.',`;

  content = content.replace(
    /(de: \{[\s\S]*?headChip3: '[^']+',\n)(\s+stepPill:)/,
    `$1${cityExtra}\n$2`
  );

  const usExtra = `
                stepsLabel: 'Step 2 of 4',
                stepsTitle: 'Select your city',
                stepsLead: 'Choose a city to see local housing programs and listings.',
                stepsFoot: 'Free · No sign-up · About 2 minutes',
                stepsCta: 'Browse cities below',
                stepsProgressMeta: '~1 min left',
                stepDetail: 'Pick a city to filter programs and listings in your area.',`;

  content = content.replace(
    /(us: \{[\s\S]*?headChip3: 'No sign-up required',\n)(\s+stepPill:)/,
    `$1${usExtra}\n$2`
  );

  const chExtra = `
                stepsLabel: 'Schritt 2 von 4',
                stepsTitle: 'Gemeinde auswählen',
                stepsLead: 'Wählen Sie eine Gemeinde, um lokale Programme und Angebote zu sehen.',
                stepsFoot: 'Kostenlos · Ohne Anmeldung · Ca. 2 Minuten',
                stepsCta: 'Gemeinden unten durchsuchen',
                stepsProgressMeta: 'Noch ca. 1 Min.',
                stepDetail: 'Wählen Sie eine Gemeinde, um Angebote in Ihrer Region zu filtern.',`;

  content = content.replace(
    /('de-ch-at': \{[\s\S]*?headChip3: 'Ohne Anmeldung',\n)(\s+stepPill:)/,
    `$1${chExtra}\n$2`
  );

  content = content.replace(
    /city: 'Select city', cityHint: 'Pick a city nearby',/,
    `city: 'Select city', cityHint: 'Tap below — badges show listing counts',`
  );

  content = content.replace(
    /set\('lang_apartment_hint', copy\.apartmentHint\);\n        var parent = document\.getElementById\('state_crumb_parent'\);/,
    `set('lang_apartment_hint', copy.apartmentHint);
        applyPickerStepsChrome(2, copy);
        var parent = document.getElementById('state_crumb_parent');`
  );

  // After city list renders - find innerHTML assignment end
  if (!content.includes('updatePickerStepsCta(lang, 2')) {
    content = content.replace(
      /document\.getElementById\("select-state"\)\.innerHTML = innerStr;/,
      `document.getElementById("select-state").innerHTML = innerStr;
        updatePickerStepsCta(lang, 2, (data || []).length);`
    );
  }

  return content;
}

function patchApplyDistrictPageCopy(content) {
  if (content.includes('applyPickerStepsChrome(3, copy)')) return content;

  const deExtra = `
                stepsLabel: 'Schritt 3 von 4',
                stepsTitle: 'Bezirk auswählen',
                stepsLead: 'Wählen Sie einen Bezirk, um passende Wohnangebote einzugrenzen.',
                stepsFoot: 'Kostenlos · Ohne Anmeldung · Ca. 2 Minuten',
                stepsCta: 'Bezirke unten durchsuchen',
                stepsProgressMeta: 'Fast geschafft',
                stepDetail: 'Grenzen Sie Ihre Suche auf den passenden Stadtteil ein.',`;

  content = content.replace(
    /(de: \{[\s\S]*?headChip3: '[^']+',\n)(\s+stepPill:)/,
    `$1${deExtra}\n$2`
  );

  const usExtra = `
                stepsLabel: 'Step 3 of 4',
                stepsTitle: 'Select your district',
                stepsLead: 'Choose a district to browse matching affordable housing listings.',
                stepsFoot: 'Free · No sign-up · About 2 minutes',
                stepsCta: 'Browse districts below',
                stepsProgressMeta: 'Almost there',
                stepDetail: 'Narrow your search to the neighborhood that fits you best.',`;

  content = content.replace(
    /(us: \{[\s\S]*?headChip3: 'Free to browse',\n)(\s+stepPill:)/,
    `$1${usExtra}\n$2`
  );

  const chExtra = `
                stepsLabel: 'Schritt 3 von 4',
                stepsTitle: 'Quartier auswählen',
                stepsLead: 'Wählen Sie ein Quartier, um passende Wohnangebote einzugrenzen.',
                stepsFoot: 'Kostenlos · Ohne Anmeldung · Ca. 2 Minuten',
                stepsCta: 'Quartiere unten durchsuchen',
                stepsProgressMeta: 'Fast geschafft',
                stepDetail: 'Grenzen Sie Ihre Suche auf die passende Umgebung ein.',`;

  content = content.replace(
    /('de-ch-at': \{[\s\S]*?headChip3: 'Kostenlos browsen',\n)(\s+stepPill:)/,
    `$1${chExtra}\n$2`
  );

  content = content.replace(
    /district: 'Select district', districtHint: 'Narrow your area',/,
    `district: 'Select district', districtHint: 'Filter by neighborhood',`
  );

  content = content.replace(
    /set\('lang_apartment_hint', copy\.apartmentHint\);\n        var stateCrumb = document\.getElementById\('state_crumb_state'\);/,
    `set('lang_apartment_hint', copy.apartmentHint);
        applyPickerStepsChrome(3, copy);
        var stateCrumb = document.getElementById('state_crumb_state');`
  );

  if (!content.includes('updatePickerStepsCta(lang, 3')) {
    content = content.replace(
      /document\.getElementById\("select-state"\)\.innerHTML = innerStr;/,
      `document.getElementById("select-state").innerHTML = innerStr;
        updatePickerStepsCta(lang, 3, (data || []).length);`
    );
  }

  return content;
}

for (const lang of langs) {
  for (const page of pages) {
    const fp = path.join(root, lang, `${page}.html`);
    let content = fs.readFileSync(fp, 'utf8');
    content = replaceStepsCard(content, page);

    if (page === 'state') {
      content = patchApplyStatePageCopy(content);
      // Ensure picker id on state page
      content = content.replace(
        /<div class="state-picker-card">\n            <div class="state-picker-head">/,
        '<div class="state-picker-card" id="state-picker-card">\n            <div class="state-picker-head">'
      );
    } else if (page === 'city') {
      content = patchApplyCityPageCopy(content);
    } else {
      content = patchApplyDistrictPageCopy(content);
    }

    fs.writeFileSync(fp, content);
    console.log('patched', `${lang}/${page}.html`);
  }
}
