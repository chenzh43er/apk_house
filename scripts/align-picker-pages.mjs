import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const langs = ['us', 'de', 'de-ch-at'];

const CSS_LINKS = `    <link rel="stylesheet" href="/Public/Css/form-page.css">
    <link rel="stylesheet" href="/Public/Css/teach-page.css">
    <link rel="stylesheet" href="/Public/Css/state-page.css">`;

const INLINE_STYLE_START = '    <style>\n        .select-state {';
const BODY_OLD = '<body style="display: none">';
const BODY_CITY = '<body class="page-state page-teach page-city" aria-hidden="false" style="display: none">';
const BODY_DISTRICT = '<body class="page-state page-teach page-district" aria-hidden="false" style="display: none">';

function patchHead(content) {
  if (content.includes('/Public/Css/state-page.css')) return content;
  content = content.replace(
    '<link type="text/css" rel="stylesheet" href="./Public/Css/lch-office.css">',
    `<link type="text/css" rel="stylesheet" href="./Public/Css/lch-office.css">\n${CSS_LINKS}`
  );
  const styleStart = content.indexOf(INLINE_STYLE_START);
  if (styleStart !== -1) {
    const styleEnd = content.indexOf('    </style>', styleStart);
    if (styleEnd !== -1) {
      content = content.slice(0, styleStart) + content.slice(styleEnd + '    </style>'.length + 1);
    }
  }
  return content;
}

function cityMainHtml() {
  return `<main class="wrapper contents state-main">
    <div class="detail-left state-content" data-eusoft-scrollable-element="1">
        <div class="state-page-head">
            <nav class="state-page-head__crumbs" aria-label="Breadcrumb">
                <ol class="state-crumb" itemscope itemtype="https://schema.org/BreadcrumbList">
                    <li itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
                        <a href="./home.html" itemprop="item"><span id="state_crumb_home" itemprop="name">Home</span></a>
                        <meta itemprop="position" content="1">
                    </li>
                    <li itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
                        <a href="#" id="state_crumb_parent_link" itemprop="item"><span id="state_crumb_parent" itemprop="name">State</span></a>
                        <meta itemprop="position" content="2">
                    </li>
                    <li itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem" aria-current="page">
                        <span id="state_crumb_current" itemprop="name">Select city</span>
                        <meta itemprop="position" content="3">
                    </li>
                </ol>
            </nav>
            <p class="state-page-head__label" id="state_page_label">City selection</p>
            <h1 class="state-page-head__title" id="title_find">Find affordable housing</h1>
            <p class="state-page-lead" id="state_page_lead">Pick a city to see affordable housing programs and listings.</p>
        </div>

        <div class="adswp state-ad" id="state_adv1">Advertise</div>

        <div class="teach-steps-card state-steps-card">
            <ol class="select-text teach-steps teach-steps-flow" role="list">
                <li class="select-box select-after teach-step" role="listitem">
                    <article class="step_box teach-step__card">
                        <div class="teach-step__head">
                            <span class="prog teach-step__num" aria-hidden="true"></span>
                        </div>
                        <div class="teach-step__icon">
                            <img id="conPic" class="teach-step__img" src="" alt="Country">
                        </div>
                        <div class="teach-step__copy">
                            <p class="h4 teach-step__text" id="lang_state"></p>
                            <span class="teach-step__hint" id="lang_state_hint"></span>
                        </div>
                    </article>
                </li>
                <li class="select-box select-now teach-step" role="listitem">
                    <article class="step_box teach-step__card">
                        <div class="teach-step__head">
                            <span class="prog teach-step__num" aria-hidden="true"></span>
                            <span class="teach-step__pill" id="lang_step_pill">You are here</span>
                        </div>
                        <div class="teach-step__icon">
                            <img id="statePic" class="teach-step__img" src="" alt="State">
                        </div>
                        <div class="teach-step__copy">
                            <p class="h4 teach-step__text" id="lang_city"></p>
                            <span class="teach-step__hint" id="lang_city_hint"></span>
                        </div>
                    </article>
                </li>
                <li class="select-box select-after teach-step" role="listitem">
                    <article class="step_box teach-step__card">
                        <div class="teach-step__head">
                            <span class="prog teach-step__num" aria-hidden="true"></span>
                        </div>
                        <div class="teach-step__icon">
                            <img class="teach-step__img teach-step__img--svg" src="/Public/Images/teach/step-city.svg" alt="District">
                        </div>
                        <div class="teach-step__copy">
                            <p class="h4 teach-step__text" id="lang_district"></p>
                            <span class="teach-step__hint" id="lang_district_hint"></span>
                        </div>
                    </article>
                </li>
                <li class="select-box select-after teach-step" role="listitem">
                    <article class="step_box teach-step__card">
                        <div class="teach-step__head">
                            <span class="prog teach-step__num" aria-hidden="true"></span>
                        </div>
                        <div class="teach-step__icon">
                            <img class="teach-step__img teach-step__img--svg" src="/Public/Images/teach/step-listings.svg" alt="Apartment">
                        </div>
                        <div class="teach-step__copy">
                            <p class="h4 teach-step__text" id="lang_apartment"></p>
                            <span class="teach-step__hint" id="lang_apartment_hint"></span>
                        </div>
                    </article>
                </li>
            </ol>
        </div>

        <div class="state-picker-card">
            <div class="state-picker-head">
                <h2 class="state-picker-title" id="state_picker_title">Browse by city</h2>
                <p class="state-picker-lead" id="state_picker_lead">Tap a city below to see available housing programs.</p>
            </div>
            <ul class="select-state state-grid" id="select-state"></ul>
        </div>

        <div class="teach-info state-info">
            <article class="teach-info-card teach-info-card--intro">
                <h2 class="teach-info-card__title" id="lang_how1_title">Your free guide to affordable housing</h2>
                <p class="teach-info-card__lead" id="lang_how1"></p>
            </article>
            <article class="teach-info-card">
                <p class="teach-info-card__lead teach-info-card__lead--secondary" id="lang_how2"></p>
            </article>
        </div>
    </div>

    <div class="detail-rightside" id="asidePage"></div>
</main>`;
}

function districtMainHtml() {
  return `<main class="wrapper contents state-main">
    <div class="detail-left state-content" data-eusoft-scrollable-element="1">
        <div class="state-page-head">
            <nav class="state-page-head__crumbs" aria-label="Breadcrumb">
                <ol class="state-crumb" itemscope itemtype="https://schema.org/BreadcrumbList">
                    <li itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
                        <a href="./home.html" itemprop="item"><span id="state_crumb_home" itemprop="name">Home</span></a>
                        <meta itemprop="position" content="1">
                    </li>
                    <li itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
                        <a href="#" id="state_crumb_state_link" itemprop="item"><span id="state_crumb_state" itemprop="name">State</span></a>
                        <meta itemprop="position" content="2">
                    </li>
                    <li itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
                        <a href="#" id="state_crumb_city_link" itemprop="item"><span id="state_crumb_city" itemprop="name">City</span></a>
                        <meta itemprop="position" content="3">
                    </li>
                    <li itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem" aria-current="page">
                        <span id="state_crumb_current" itemprop="name">Select district</span>
                        <meta itemprop="position" content="4">
                    </li>
                </ol>
            </nav>
            <p class="state-page-head__label" id="state_page_label">District selection</p>
            <h1 class="state-page-head__title" id="title_find">Find affordable housing</h1>
            <p class="state-page-lead" id="state_page_lead">Pick a district to see affordable housing listings.</p>
        </div>

        <div class="adswp state-ad" id="state_adv1">Advertise</div>

        <div class="teach-steps-card state-steps-card">
            <ol class="select-text teach-steps teach-steps-flow" role="list">
                <li class="select-box select-after teach-step" role="listitem">
                    <article class="step_box teach-step__card">
                        <div class="teach-step__head">
                            <span class="prog teach-step__num" aria-hidden="true"></span>
                        </div>
                        <div class="teach-step__icon">
                            <img id="conPic" class="teach-step__img" src="" alt="Country">
                        </div>
                        <div class="teach-step__copy">
                            <p class="h4 teach-step__text" id="lang_state"></p>
                            <span class="teach-step__hint" id="lang_state_hint"></span>
                        </div>
                    </article>
                </li>
                <li class="select-box select-after teach-step" role="listitem">
                    <article class="step_box teach-step__card">
                        <div class="teach-step__head">
                            <span class="prog teach-step__num" aria-hidden="true"></span>
                        </div>
                        <div class="teach-step__icon">
                            <img id="statePic" class="teach-step__img" src="" alt="City">
                        </div>
                        <div class="teach-step__copy">
                            <p class="h4 teach-step__text" id="lang_city"></p>
                            <span class="teach-step__hint" id="lang_city_hint"></span>
                        </div>
                    </article>
                </li>
                <li class="select-box select-now teach-step" role="listitem">
                    <article class="step_box teach-step__card">
                        <div class="teach-step__head">
                            <span class="prog teach-step__num" aria-hidden="true"></span>
                            <span class="teach-step__pill" id="lang_step_pill">You are here</span>
                        </div>
                        <div class="teach-step__icon">
                            <img class="teach-step__img teach-step__img--svg" src="/Public/Images/teach/step-city.svg" alt="District">
                        </div>
                        <div class="teach-step__copy">
                            <p class="h4 teach-step__text" id="lang_district"></p>
                            <span class="teach-step__hint" id="lang_district_hint"></span>
                        </div>
                    </article>
                </li>
                <li class="select-box select-after teach-step" role="listitem">
                    <article class="step_box teach-step__card">
                        <div class="teach-step__head">
                            <span class="prog teach-step__num" aria-hidden="true"></span>
                        </div>
                        <div class="teach-step__icon">
                            <img class="teach-step__img teach-step__img--svg" src="/Public/Images/teach/step-listings.svg" alt="Apartment">
                        </div>
                        <div class="teach-step__copy">
                            <p class="h4 teach-step__text" id="lang_apartment"></p>
                            <span class="teach-step__hint" id="lang_apartment_hint"></span>
                        </div>
                    </article>
                </li>
            </ol>
        </div>

        <div class="state-picker-card">
            <div class="state-picker-head">
                <h2 class="state-picker-title" id="state_picker_title">Browse by district</h2>
                <p class="state-picker-lead" id="state_picker_lead">Tap a district below to see available listings.</p>
            </div>
            <ul class="select-state state-grid" id="select-state"></ul>
        </div>

        <div class="teach-info state-info">
            <article class="teach-info-card teach-info-card--intro">
                <h2 class="teach-info-card__title" id="lang_how1_title">Your free guide to affordable housing</h2>
                <p class="teach-info-card__lead" id="lang_how1"></p>
            </article>
            <article class="teach-info-card">
                <p class="teach-info-card__lead teach-info-card__lead--secondary" id="lang_how2"></p>
            </article>
        </div>
    </div>

    <div class="detail-rightside" id="asidePage"></div>
</main>`;
}

function copyHelpersBlock() {
  return `
    function applyStateStepImages(lang, country) {
        var con = document.getElementById('conPic');
        var state = document.getElementById('statePic');
        if (!con || !state) return;
        if (lang === 'de') {
            con.src = './Public/Images/dePic.png';
            state.src = './Public/Images/statePic.png';
        } else if (lang === 'us') {
            con.src = './Public/Images/amPic.png';
            state.src = './Public/Images/amSPic.png';
        } else if (country === 'ch') {
            con.src = './Public/Images/chPic.png';
            state.src = './Public/Images/chCity.png';
        } else if (country === 'at') {
            con.src = './Public/Images/atPic.png';
            state.src = './Public/Images/atCity.png';
        } else {
            con.src = './Public/Images/dePic.png';
            state.src = './Public/Images/statePic.png';
        }
    }
`;
}

function cityCopyBlock() {
  return copyHelpersBlock() + `
    function applyCityPageCopy(lang, stateName) {
        var COPY = {
            de: {
                pageLabel: 'Stadt wählen',
                crumbHome: 'Startseite',
                crumbCurrent: 'Stadt wählen',
                pageLead: 'Wählen Sie eine Stadt, um Programme und Angebote in Ihrer Region zu sehen.',
                stepPill: 'Aktueller Schritt',
                pickerTitle: 'Nach Stadt suchen',
                pickerLead: 'Tippen Sie auf eine Stadt, um verfügbare Wohnprogramme zu sehen.',
                how1Title: 'Ihr kostenloser Wegweiser zum bezahlbaren Wohnraum',
                how1: 'Bezahlbarer Wohnraum ist dank staatlicher Fördermittel für einkommensschwache Haushalte zu subventionierten Preisen verfügbar. Die monatliche Miete beginnt bereits bei 300 € — deutlich unter dem üblichen Marktpreis.',
                how2: 'Geeignet für: Senioren · Menschen mit Behinderung · Familien mit geringem Einkommen · Alleinerziehende · Erstbewerber. Angebote: Sozialwohnungen · WBS-Wohnungen · geförderter Mietwohnraum · Wartelisten-Infos.',
                stateHint: 'Ausgewählt',
                city: 'Stadt auswählen', cityHint: 'Stadt in der Nähe finden',
                district: 'Bezirk auswählen', districtHint: 'Stadtteil eingrenzen',
                apartment: 'Wohnung auswählen', apartmentHint: 'Passende Angebote ansehen',
                title: 'Bezahlbaren Wohnraum finden'
            },
            us: {
                pageLabel: 'City selection',
                crumbHome: 'Home',
                crumbCurrent: 'Select city',
                pageLead: 'Pick a city to see affordable housing programs and listings in your area.',
                stepPill: 'You are here',
                pickerTitle: 'Browse by city',
                pickerLead: 'Tap a city below to see available housing programs.',
                how1Title: 'Your free guide to affordable housing',
                how1: 'Affordable housing is available at subsidized rates thanks to government funding for low-income households. Monthly rent can be as low as $300 — well below market rates.',
                how2: 'Who it helps: seniors · people with disabilities · low-income families · single parents · first-time applicants. What you\\'ll find: Section 8 · public housing · LIHTC apartments · waiting-list updates.',
                stateHint: 'Selected',
                city: 'Select city', cityHint: 'Pick a city nearby',
                district: 'Select district', districtHint: 'Narrow your area',
                apartment: 'Select apartment', apartmentHint: 'Browse matching listings',
                title: 'Find affordable housing'
            },
            'de-ch-at': {
                pageLabel: 'Gemeinde wählen',
                crumbHome: 'Startseite',
                crumbCurrent: 'Gemeinde wählen',
                pageLead: 'Wählen Sie eine Gemeinde, um Programme und Angebote in Ihrer Region zu sehen.',
                stepPill: 'Aktueller Schritt',
                pickerTitle: 'Nach Gemeinde suchen',
                pickerLead: 'Tippen Sie auf eine Gemeinde, um verfügbare Wohnprogramme zu sehen.',
                how1Title: 'Ihr kostenloser Wegweiser zum bezahlbaren Wohnraum',
                how1: 'Subventionierter Wohnraum ist dank staatlicher und kantonaler Förderung für einkommensschwache Haushalte verfügbar. Die monatliche Miete beginnt bereits bei 300 €.',
                how2: 'Geeignet für: Senioren · Familien · Neue Bewerber · Alle mit begrenztem Einkommen. Angebote: gemeinnütziger Wohnbau · subventionierte Wohnungen · Wartelisten-Updates.',
                stateHint: 'Ausgewählt',
                city: 'Gemeinde wählen', cityHint: 'Ort in der Nähe finden',
                district: 'Quartier wählen', districtHint: 'Umgebung eingrenzen',
                apartment: 'Wohnung wählen', apartmentHint: 'Passende Angebote ansehen',
                title: 'Bezahlbaren Wohnraum finden'
            }
        };
        var copy = COPY[lang] || COPY.us;
        var set = function (id, text) {
            var el = document.getElementById(id);
            if (el && text != null) el.textContent = text;
        };
        set('title_find', copy.title);
        set('state_page_label', copy.pageLabel);
        set('state_crumb_home', copy.crumbHome);
        set('state_crumb_current', copy.crumbCurrent);
        set('state_page_lead', copy.pageLead);
        set('lang_step_pill', copy.stepPill);
        set('state_picker_title', copy.pickerTitle);
        set('state_picker_lead', copy.pickerLead);
        set('lang_how1_title', copy.how1Title);
        set('lang_how1', copy.how1);
        set('lang_how2', copy.how2);
        set('lang_state', stateName || '');
        set('lang_state_hint', copy.stateHint);
        set('lang_city', copy.city);
        set('lang_city_hint', copy.cityHint);
        set('lang_district', copy.district);
        set('lang_district_hint', copy.districtHint);
        set('lang_apartment', copy.apartment);
        set('lang_apartment_hint', copy.apartmentHint);
        var parent = document.getElementById('state_crumb_parent');
        var parentLink = document.getElementById('state_crumb_parent_link');
        if (parent && stateName) parent.textContent = stateName;
        if (parentLink && stateName) {
            parentLink.href = buildTeachStatePath(lang);
        }
    }
`;
}

function districtCopyBlock() {
  return copyHelpersBlock() + `
    function applyDistrictPageCopy(lang, stateName, cityName) {
        var COPY = {
            de: {
                pageLabel: 'Bezirk wählen',
                crumbHome: 'Startseite',
                crumbCurrent: 'Bezirk wählen',
                pageLead: 'Wählen Sie einen Bezirk, um passende Wohnangebote zu sehen.',
                stepPill: 'Aktueller Schritt',
                pickerTitle: 'Nach Bezirk suchen',
                pickerLead: 'Tippen Sie auf einen Bezirk, um verfügbare Angebote zu sehen.',
                how1Title: 'Ihr kostenloser Wegweiser zum bezahlbaren Wohnraum',
                how1: 'Bezahlbarer Wohnraum ist dank staatlicher Fördermittel für einkommensschwache Haushalte zu subventionierten Preisen verfügbar. Die monatliche Miete beginnt bereits bei 300 € — deutlich unter dem üblichen Marktpreis.',
                how2: 'Geeignet für: Senioren · Menschen mit Behinderung · Familien mit geringem Einkommen · Alleinerziehende · Erstbewerber. Angebote: Sozialwohnungen · WBS-Wohnungen · geförderter Mietwohnraum · Wartelisten-Infos.',
                stateHint: 'Ausgewählt',
                cityHint: 'Ausgewählt',
                district: 'Bezirk auswählen', districtHint: 'Stadtteil eingrenzen',
                apartment: 'Wohnung auswählen', apartmentHint: 'Passende Angebote ansehen',
                title: 'Bezahlbaren Wohnraum finden'
            },
            us: {
                pageLabel: 'District selection',
                crumbHome: 'Home',
                crumbCurrent: 'Select district',
                pageLead: 'Pick a district to see affordable housing listings in your area.',
                stepPill: 'You are here',
                pickerTitle: 'Browse by district',
                pickerLead: 'Tap a district below to see available listings.',
                how1Title: 'Your free guide to affordable housing',
                how1: 'Affordable housing is available at subsidized rates thanks to government funding for low-income households. Monthly rent can be as low as $300 — well below market rates.',
                how2: 'Who it helps: seniors · people with disabilities · low-income families · single parents · first-time applicants. What you\\'ll find: Section 8 · public housing · LIHTC apartments · waiting-list updates.',
                stateHint: 'Selected',
                cityHint: 'Selected',
                district: 'Select district', districtHint: 'Narrow your area',
                apartment: 'Select apartment', apartmentHint: 'Browse matching listings',
                title: 'Find affordable housing'
            },
            'de-ch-at': {
                pageLabel: 'Quartier wählen',
                crumbHome: 'Startseite',
                crumbCurrent: 'Quartier wählen',
                pageLead: 'Wählen Sie ein Quartier, um passende Wohnangebote zu sehen.',
                stepPill: 'Aktueller Schritt',
                pickerTitle: 'Nach Quartier suchen',
                pickerLead: 'Tippen Sie auf ein Quartier, um verfügbare Angebote zu sehen.',
                how1Title: 'Ihr kostenloser Wegweiser zum bezahlbaren Wohnraum',
                how1: 'Subventionierter Wohnraum ist dank staatlicher und kantonaler Förderung für einkommensschwache Haushalte verfügbar. Die monatliche Miete beginnt bereits bei 300 €.',
                how2: 'Geeignet für: Senioren · Familien · Neue Bewerber · Alle mit begrenztem Einkommen. Angebote: gemeinnütziger Wohnbau · subventionierte Wohnungen · Wartelisten-Updates.',
                stateHint: 'Ausgewählt',
                cityHint: 'Ausgewählt',
                district: 'Quartier wählen', districtHint: 'Umgebung eingrenzen',
                apartment: 'Wohnung wählen', apartmentHint: 'Passende Angebote ansehen',
                title: 'Bezahlbaren Wohnraum finden'
            }
        };
        var copy = COPY[lang] || COPY.us;
        var set = function (id, text) {
            var el = document.getElementById(id);
            if (el && text != null) el.textContent = text;
        };
        set('title_find', copy.title);
        set('state_page_label', copy.pageLabel);
        set('state_crumb_home', copy.crumbHome);
        set('state_crumb_current', copy.crumbCurrent);
        set('state_page_lead', copy.pageLead);
        set('lang_step_pill', copy.stepPill);
        set('state_picker_title', copy.pickerTitle);
        set('state_picker_lead', copy.pickerLead);
        set('lang_how1_title', copy.how1Title);
        set('lang_how1', copy.how1);
        set('lang_how2', copy.how2);
        set('lang_state', stateName || '');
        set('lang_state_hint', copy.stateHint);
        set('lang_city', cityName || '');
        set('lang_city_hint', copy.cityHint);
        set('lang_district', copy.district);
        set('lang_district_hint', copy.districtHint);
        set('lang_apartment', copy.apartment);
        set('lang_apartment_hint', copy.apartmentHint);
        var stateCrumb = document.getElementById('state_crumb_state');
        var stateLink = document.getElementById('state_crumb_state_link');
        var cityCrumb = document.getElementById('state_crumb_city');
        var cityLink = document.getElementById('state_crumb_city_link');
        if (stateCrumb && stateName) stateCrumb.textContent = stateName;
        if (cityCrumb && cityName) cityCrumb.textContent = cityName;
        if (stateLink && stateName) stateLink.href = buildTeachStatePath(lang);
        if (cityLink && stateName) {
            cityLink.href = buildTeachStatePath(lang, stateName, 'city');
        }
    }
`;
}

function replaceMain(content, newMain) {
  const start = content.indexOf('<main class="wrapper contents');
  const end = content.indexOf('</main>', start);
  if (start === -1 || end === -1) throw new Error('main block not found');
  return content.slice(0, start) + newMain + content.slice(end + '</main>'.length);
}

function removeOldCopyScript(content, advLoader) {
  const marker = advLoader === 'City' ? 'loadCity_adv1' : 'loadDistrict_adv1';
  const advScriptStart = content.lastIndexOf('<script>', content.indexOf(marker));
  const oldCopyStart = content.indexOf('<script>\n    $(document).ready(function () {\n        const lang = getLangFromPath()', advScriptStart);
  if (oldCopyStart === -1) return content;
  const oldCopyEnd = content.indexOf('</script>', oldCopyStart) + '</script>'.length;
  return content.slice(0, oldCopyStart) + content.slice(oldCopyEnd);
}

function injectCopyScript(content, copyBlock, pageType) {
  const marker = pageType === 'city' ? 'fetchCitiesByState' : 'fetchDistrictsByCity';
  if (content.includes(pageType === 'city' ? 'function applyCityPageCopy' : 'function applyDistrictPageCopy')) {
    return content;
  }
  let searchFrom = 0;
  let insertBefore = -1;
  while (true) {
    const idx = content.indexOf('<script type="module">', searchFrom);
    if (idx === -1) break;
    const endIdx = content.indexOf('</script>', idx);
    const chunk = content.slice(idx, endIdx);
    if (chunk.includes(marker)) {
      insertBefore = idx;
      break;
    }
    searchFrom = idx + 1;
  }
  if (insertBefore === -1) throw new Error('module script not found for ' + pageType);
  const block = `<script>${copyBlock}\n</script>\n\n`;
  return content.slice(0, insertBefore) + block + content.slice(insertBefore);
}

function patchCityModule(content) {
  content = content.replace(
    /document\.getElementById\("state_label"\)\.innerText = display_state\s*\n\s*\n\s*let innerStr = '';/,
    `const params = new URLSearchParams(window.location.search);
        const country = params.get('country');
        applyCityPageCopy(lang, display_state);
        applyStateStepImages(lang, country);

        let innerStr = '';`
  );
  content = content.replace(
    /innerStr \+= `<li>\s*\n\s*<a href="\$\{link_href\}" class="state-link">\s*\n\s*<div class = "selectLidiv">\s*\n\s*<div class="text-wrapper">\s*\n\s*\$\{item\.display_city\}<\/div><\/div>\s*\n\s*<\/a>\s*\n\s*<\/li>`;/,
    `innerStr += \`<li>
                <a href="\${link_href}" class="state-link"><span class="state-tile selectLidiv"><span class="state-tile__text text-wrapper">\${item.display_city}</span></span></a>
                </li>\`;`
  );
  content = content.replace(
    /if\(\(index\+1\) % 16 == 0 && data\.length > 16\)/,
    'if((index+1) % 16 == 0)'
  );
  content = content.replace(
    /\s*if\(data\.length < 12\)\{\s*\n\s*document\.getElementById\("ddr_adv"\)\.innerHTML = returnAdvWord\(\)\s*\n\s*\}\s*\n/g,
    '\n'
  );
  content = content.replace(
    /\s*const ddr_adv = document\.getElementById\('ddr_adv'\)[\s\S]*?observer\.observe\(ddr_adv\);\s*\n\s*\}/,
    '\n    }'
  );
  return content;
}

function patchDistrictModule(content) {
  content = content.replace(
    /document\.getElementById\("state_label"\)\.innerText = display_state\s*\n\s*document\.getElementById\("city_label"\)\.innerText = display_city\s*\n\s*const \{data, error\}/,
    `const params = new URLSearchParams(window.location.search);
    const country = params.get('country');
    applyDistrictPageCopy(lang, display_state, display_city);
    applyStateStepImages(lang, country);

    const {data, error}`
  );
  content = content.replace(
    /innerStr \+= `\s*\n\s*<li>\s*\n\s*<a href="\$\{link_href\}">\s*\n\s*<div class = "selectLidiv"><div class="text-wrapper"> \$\{item\.display_district\}<\/div><\/div>\s*\n\s*<\/a>\s*\n\s*<\/li>`;/,
    `innerStr += \`<li>
                    <a href="\${link_href}" class="state-link"><span class="state-tile selectLidiv"><span class="state-tile__text text-wrapper">\${item.display_district}</span></span></a>
                </li>\`;`
  );
  content = content.replace(
    /if\(\(index\+1\) % 16 == 0\)\{/,
    'if((index+1) % 16 == 0){'
  );
  content = content.replace(
    /\s*if\(data\.length < 12\)\{\s*\n\s*document\.getElementById\("ddr_adv"\)\.innerHTML = returnAdvWord\(\)\s*\n\s*\}\s*\n/g,
    '\n'
  );
  content = content.replace(
    /\s*const ddr_adv = document\.getElementById\('ddr_adv'\)[\s\S]*?observer\.observe\(ddr_adv\);\s*\n\s*\}/,
    '\n    }'
  );
  return content;
}

function patchAdvDiv(content) {
  return content.replace(
    /<div style="text-align: center" id="state_adv1">\s*\n\s*<\/div>/,
    '<div class="adswp state-ad" id="state_adv1">Advertise</div>'
  ).replace(
    /<div class="adswp" style="height: auto !important;"[^>]*id="state_adv1">\s*\n\s*<\/div>/,
    '<div class="adswp state-ad" id="state_adv1">Advertise</div>'
  );
}

for (const lang of langs) {
  for (const [page, bodyClass, mainHtml, copyBlock, patchModule, advLoader] of [
    ['city', BODY_CITY, cityMainHtml(), cityCopyBlock(), patchCityModule, 'City'],
    ['district', BODY_DISTRICT, districtMainHtml(), districtCopyBlock(), patchDistrictModule, 'District'],
  ]) {
    const fp = path.join(root, lang, `${page}.html`);
    let content = fs.readFileSync(fp, 'utf8');
    content = patchHead(content);
    content = content.replace(BODY_OLD, bodyClass);
    content = replaceMain(content, mainHtml);
    content = injectCopyScript(content, copyBlock, page);
    content = patchModule(content);
    content = removeOldCopyScript(content, advLoader);
    fs.writeFileSync(fp, content);
    console.log('aligned', `${lang}/${page}.html`);
  }
}
