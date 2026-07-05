/**
 * Localize de / de-ch-at UI strings to match the polished us site chrome.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

/** @type {{ dir: string; langAttr: string; fixLangCheck: boolean }[]} */
const LOCALES = [
  { dir: "de", langAttr: "de", fixLangCheck: false },
  { dir: "de-ch-at", langAttr: "de", fixLangCheck: true },
];

/** @type {[string, string][]} */
const REPLACEMENTS = [
  [">About Us</a>", ">Über uns</a>"],
  [">Disclaimer</a>", ">Haftungsausschluss</a>"],
  [">Privacy Policy</a>", ">Datenschutz</a>"],
  ["All Rights Reserved.", "Alle Rechte vorbehalten."],
  ['aria-label="Open menu"', 'aria-label="Menü öffnen"'],
  ['aria-label="Main navigation"', 'aria-label="Hauptnavigation"'],
  ['aria-label="Footer navigation"', 'aria-label="Fußzeilen-Navigation"'],
  ['aria-label="Legal pages"', 'aria-label="Rechtliche Seiten"'],
  ['<html lang="en"', '<html lang="de"'],
  [
    'content="Identity Insight provides free, up-to-date information about Section 8 and low-income housing resources, including waiting lists and local housing authorities."',
    'content="Identity Insight bietet kostenlose und aktuelle Informationen zu bezahlbarem Wohnraum und Hilfsangeboten für Menschen mit geringem Einkommen."',
  ],
  ['Legal Information', "Rechtliche Informationen"],
  ['>About Us</a>', ">Über uns</a>"],
  ['legal-nav__link--active">About Us', 'legal-nav__link--active">Über uns'],
  ['legal-nav__link--active">Disclaimer', 'legal-nav__link--active">Haftungsausschluss'],
  ['legal-nav__link--active">Privacy Policy', 'legal-nav__link--active">Datenschutz'],
  ['<title>About Us</title>', "<title>Über uns</title>"],
  ["<title>Disclaimer</title>", "<title>Haftungsausschluss</title>"],
  ["<title>Privacy Policy</title>", "<title>Datenschutz</title>"],
];

/** @param {string} content @param {boolean} fixLangCheck */
function patchLangChecks(content, fixLangCheck) {
  if (!fixLangCheck) return content;
  let next = content;
  next = next.replace(/if\s*\(\s*lang\s*==\s*"de"\s*\)/g, 'if(lang == "de" || lang == "de-ch-at")');
  next = next.replace(/if\s*\(\s*lang\s*===\s*"de"\s*\)/g, 'if(lang === "de" || lang === "de-ch-at")');
  // de-ch-at pages should default nav to Startseite, not Home
  next = next.replace(
    /getElementById\("lang_index"\),"Home"\)\s*\}\s*\n\s*\n<\/script>/g,
    'getElementById("lang_index"),"Startseite")\n            }\n\n</script>'
  );
  return next;
}

/** @param {string} filePath */
function patchHomeHtml(filePath) {
  let content = fs.readFileSync(filePath, "utf8");
  const original = content;

  content = content.replace(
    /<div class="hs-banner-cate" id = "lang_title">[\s\S]*?<\/div>/,
    '<div class="hs-banner-cate" id = "lang_title">Kostenlose Hilfsangebote für Menschen mit geringem Einkommen</div>'
  );
  content = content.replace(
    /<span id = "lang_cheap">[\s\S]*?<\/span>/,
    '<span id = "lang_cheap">Günstige Wohnung in meiner Nähe</span>'
  );
  content = content.replace(
    /<a href="\.\/teach\.html" class="hs-aff-item" id = "lang_click">[\s\S]*?<\/a>/,
    `<a href="./teach.html" class="hs-aff-item" id = "lang_click">Bezahlbare Wohnung
                <svg class="right-arrow">
                    <use xlink:href="#right-arrow"></use>
                </svg>
            </a>`
  );
  content = content.replace(
    /<h2 class="common-tit"[\s\S]*?id = "lang_topsearch">[\s\S]*?<\/h2>/,
    `<h2 class="common-tit" data-eusoft-scrollable-element="1" id = "lang_topsearch">
            Meistgesuchter bezahlbarer Wohnraum
        </h2>`
  );
  content = content.replace(
    /<div class="hs-common-subtit" id = "lang_searchmonth">[\s\S]*?<\/div>/,
    `<div class="hs-common-subtit" id = "lang_searchmonth">
            Hier sind die meistgesuchten Begriffe des Monats.
        </div>`
  );

  const states = [
    ["lang_ad1", "href_ad1", "Baden-Württemberg"],
    ["lang_ad2", "href_ad2", "Bayern"],
    ["lang_ad3", "href_ad3", "Berlin"],
    ["lang_ad4", "href_ad4", "Brandenburg"],
    ["lang_ad5", "href_ad5", "Bremen"],
    ["lang_ad6", "href_ad6", "Hamburg"],
  ];
  for (const [id, hrefId, name] of states) {
    content = content.replace(
      new RegExp(`(<div class="top-tit"[\\s\\S]*?id = "${id}">)[\\s\\S]*?(</div>)`),
      `$1${name}$2`
    );
    content = content.replace(
      new RegExp(`(<a href="#") id = "${hrefId}"`),
      `<a href="./city.html?state=${encodeURIComponent(name)}" id = "${hrefId}"`
    );
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content, "utf8");
    return true;
  }
  return false;
}

/** @param {string} dir @param {string[]} files */
function collectHtmlFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "Public" || entry.name === "node_modules") continue;
      collectHtmlFiles(full, files);
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      files.push(full);
    }
  }
  return files;
}

/** @param {string} filePath @param {boolean} fixLangCheck */
function patchFile(filePath, fixLangCheck) {
  let content = fs.readFileSync(filePath, "utf8");
  const original = content;

  for (const [from, to] of REPLACEMENTS) {
    content = content.split(from).join(to);
  }
  content = patchLangChecks(content, fixLangCheck);

  if (content !== original) {
    fs.writeFileSync(filePath, content, "utf8");
    return true;
  }
  return false;
}

/** @param {string} filePath */
function patchCommonJs(filePath) {
  let content = fs.readFileSync(filePath, "utf8");
  const original = content;

  if (!content.includes("function isGermanLocale")) {
    content = content.replace(
      "function getLangFromPath() {",
      `function isGermanLocale(lang) {
    if (!lang) lang = getLangFromPath();
    return lang === "de" || lang === "de-ch-at";
}

function getLangFromPath() {`
    );
  }

  content = content.replace(
    /function returnAdvWord\(\)\{\s*return `<p style="text-align: center;text-align: center; line-height: 100px; margin: 0;width: 100%">Advertisment<\/p>`\s*\}/,
    `function returnAdvWord(){
    const label = isGermanLocale() ? "Werbung" : "Advertisment";
    return \`<p style="text-align: center;text-align: center; line-height: 100px; margin: 0;width: 100%">\${label}</p>\`
}`
  );

  if (content !== original) {
    fs.writeFileSync(filePath, content, "utf8");
    return true;
  }
  return false;
}

function main() {
  let updated = 0;

  for (const locale of LOCALES) {
    const localeDir = path.join(ROOT, locale.dir);
    for (const filePath of collectHtmlFiles(localeDir)) {
      if (patchFile(filePath, locale.fixLangCheck)) {
        updated += 1;
        console.log("  html:", path.relative(ROOT, filePath));
      }
    }

    const homePath = path.join(localeDir, "home.html");
    if (fs.existsSync(homePath) && patchHomeHtml(homePath)) {
      console.log("  home:", path.relative(ROOT, homePath));
    }

    const commonPath = path.join(localeDir, "Public", "Js", "common.js");
    if (fs.existsSync(commonPath) && patchCommonJs(commonPath)) {
      updated += 1;
      console.log("  js:", path.relative(ROOT, commonPath));
    }
  }

  console.log(`Localized ${updated} files under de / de-ch-at.`);
}

main();
