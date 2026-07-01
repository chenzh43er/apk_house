import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

let c = fs.readFileSync(path.join(ROOT, "de", "home.html"), "utf8");
c = c.split("/de/").join("/de-ch-at/");
c = c.replace(
  "in Deutschland — in wenigen",
  "in Deutschland, Österreich und der Schweiz — in wenigen"
);
c = c.replace(
  "Millionen Menschen in Deutschland haben",
  "Millionen Menschen in der DACH-Region haben"
);
c = c.replace(
  `<div class="home-stat__num">16</div>`,
  `<div class="home-stat__num">3</div>`
);
c = c.replace(
  "Bundesländer abgedeckt",
  "Länder abgedeckt"
);
c = c.replace(
  `<h3 class="home-step__title">Region wählen</h3>`,
  `<h3 class="home-step__title">Land &amp; Region wählen</h3>`
);
c = c.replace(
  "Wählen Sie Ihr Bundesland und sehen Sie sofort",
  "Wählen Sie Ihr Land und Ihre Region und sehen Sie sofort"
);
c = c.replace('if(lang == "de"){', 'if(lang == "de" || lang == "de-ch-at"){');
fs.writeFileSync(path.join(ROOT, "de-ch-at", "home.html"), c, "utf8");
console.log("de-ch-at/home.html synced");
