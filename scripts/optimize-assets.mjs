/**
 * CSS/JS/HTML volume optimizations:
 * - Shared SVG sprite (site-icons.svg)
 * - Slim header fragments
 * - layout-shell.css on article index pages
 * - Remove Font Awesome CDN
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SOCIAL_SVG = {
  "fab fa-facebook-f":
    '<svg class="social-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
  "fab fa-instagram":
    '<svg class="social-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 1.17.054 1.805.249 2.227.413.56.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.058 1.266.07 1.646.07 4.85s-.012 3.584-.07 4.85c-.054 1.17-.249 1.805-.413 2.227-.217.56-.477.96-.896 1.382-.42.419-.819.679-1.381.896-.422.164-1.057.36-2.227.413-1.266.058-1.646.07-4.85.07s-3.584-.012-4.85-.07c-1.17-.054-1.805-.249-2.227-.413-.56-.217-.96-.477-1.382-.896-.419-.42-.679-.819-.896-1.381-.164-.422-.36-1.057-.413-2.227-.058-1.266-.07-1.646-.07-4.85s.012-3.584.07-4.85c.054-1.17.249-1.805.413-2.227.217-.56.477-.96.896-1.382.42-.419.819-.679 1.381-.896.422-.164 1.057-.36 2.227-.413 1.266-.058 1.646-.07 4.85-.07zM12 0C8.741 0 8.333.014 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.689.072-4.948 0-3.259-.014-3.667-.072-4.947-.06-1.277-.262-2.149-.558-2.913-.306-.789-.719-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>',
  "fab fa-twitter":
    '<svg class="social-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  "fab fa-youtube":
    '<svg class="social-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>',
  "fab fa-whatsapp":
    '<svg class="social-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>',
  "fab fa-pinterest-p":
    '<svg class="social-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0a12 12 0 0 0-4.37 23.17c-.1-.94-.19-2.39.04-3.42l1.34-5.69s-.34-.68-.34-1.68c0-1.57.91-2.75 2.05-2.75.97 0 1.44.73 1.44 1.6 0 .97-.62 2.42-.94 3.77-.27 1.13.57 2.05 1.69 2.05 2.03 0 3.59-2.14 3.59-5.23 0-2.73-1.96-4.64-4.76-4.64-3.24 0-5.14 2.43-5.14 4.94 0 .97.37 2.02.85 2.59a.34.34 0 0 1 .08.32l-.31 1.24c-.05.2-.16.25-.37.15-1.37-.64-2.23-2.64-2.23-4.25 0-3.46 2.51-6.64 7.24-6.64 3.8 0 6.75 2.71 6.75 6.34 0 3.77-2.38 6.8-5.68 6.8-1.11 0-2.15-.58-2.51-1.26l-.68 2.6c-.25.96-.93 2.16-1.39 2.89A12 12 0 1 0 12 0z"/></svg>',
  "fab fa-snapchat-ghost":
    '<svg class="social-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.062c-.012.2-.023.391-.03.574-.07 1.695-.155 3.592-.776 4.583-.545.88-2.822 1.416-4.198 1.416-.299 0-.512-.043-.727-.085-.248-.048-.497-.096-.797-.096-.338 0-.621.06-.91.122-.318.069-.646.14-1.062.14-1.423 0-3.802-.557-4.364-1.51-.618-1.053-.7-2.886-.776-4.583-.007-.183-.018-.374-.03-.574l-.003-.062c-.104-1.628-.23-3.654.299-4.847C7.653 1.069 11.016.793 12.006.793h.2z"/></svg>',
  "fab fa-facebook-messenger":
    '<svg class="social-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0C5.373 0 0 4.975 0 11.111c0 3.497 1.745 6.616 4.472 8.652V24l4.086-2.242c1.09.3 2.246.464 3.442.464 6.627 0 12-4.974 12-11.111C24 4.975 18.627 0 12 0zm1.191 14.963l-3.055-3.26-5.963 3.26L10.732 8l3.13 3.26L19.752 8l-6.561 6.963z"/></svg>',
};

const HEADER_CONFIG = {
  "": { homeHref: "./", homeLabel: "Home" },
  us: { homeHref: "./index.html", homeLabel: "Home" },
  de: { homeHref: "./home.html", homeLabel: "Startseite" },
  "de-ch-at": { homeHref: "./home.html", homeLabel: "Startseite" },
};

function slimHeaderMarkup({ homeHref, homeLabel }) {
  return `<div class="wrapper" data-eusoft-scrollable-element="1">
    <a href="${homeHref}" class="logo">
        <img src="./Public/Images/logoImage.png" alt="logo">
    </a>
    <input type="checkbox" id="hd-menu-input">
    <div class="headshade" id="headshade"></div>
    <div class="nav-icon-back">
        <div class="icon-nav-btn">
            <a class="href-item" style="display: block;" href="/search/"></a>
            <svg class="href-item" style="z-index: 0;" aria-hidden="true">
                <use href="/Public/svg/site-icons.svg#icon-search"></use>
            </svg>
        </div>
        <label for="hd-menu-input" class="hd-menu-btn" id="hd-menu-btn">
            <span></span>
            <span></span>
            <span></span>
        </label>
    </div>
    <nav class="nav" data-eusoft-scrollable-element="1">
        <ul class="nav-ul" data-eusoft-scrollable-element="1">
            <li class="cor-category"><a href="${homeHref}" id="lang_index">${homeLabel}</a>
            </li>
        </ul>
        <label for="hd-menu-input" class="nav-label" id="btclose">
            <span></span>
            <span></span>
        </label>
    </nav>
    <div class="cl"></div>
</div>`;
}

function trimSiteIconsSvg() {
  const file = path.join(ROOT, "Public/svg/site-icons.svg");
  let content = fs.readFileSync(file, "utf8");
  const end = content.indexOf("</svg>");
  if (end !== -1) {
    content = content.slice(0, end + 6) + "\n";
    fs.writeFileSync(file, content, "utf8");
  }
}

function writeHeaderFragments() {
  for (const [locale, cfg] of Object.entries(HEADER_CONFIG)) {
    const dir = locale ? path.join(ROOT, locale) : ROOT;
    const fragment = slimHeaderMarkup(cfg) + "\n";
    fs.writeFileSync(path.join(dir, "header.html"), fragment, "utf8");
  }
}

function getLocaleFromFile(relPath) {
  const first = relPath.split(/[/\\]/)[0];
  if (first in HEADER_CONFIG) return first;
  return "";
}

function refreshInlinedHeaders(content, locale) {
  const cfg = HEADER_CONFIG[locale];
  if (!cfg) return content;
  const fragment = slimHeaderMarkup(cfg);
  return content.replace(
    /(<header\b(?=[^>]*\bid\s*=\s*["']header["'])[^>]*>)[\s\S]*?(<\/header>)/i,
    `$1\n${fragment}\n$2`
  );
}

function optimizeArticleIndexCss(content) {
  if (!content.includes("index-article.css")) return content;
  let out = content
    .replace(
      /<link[^>]*href="\.?\/?Public\/Css\/hs-style\.css"[^>]*>\s*/gi,
      ""
    )
    .replace(
      /<link[^>]*href="\.?\/?Public\/Css\/lch-office\.css"[^>]*>\s*/gi,
      ""
    );
  if (!out.includes("layout-shell.css")) {
    out = out.replace(
      /(<link[^>]*index-article\.css"[^>]*>)/i,
      '<link rel="stylesheet" href="/Public/Css/layout-shell.css">\n    $1'
    );
  }
  return out;
}

function optimizeRootIndexCss(content, filePath) {
  const isRootIndex =
    path.basename(filePath) === "index.html" &&
    path.resolve(path.dirname(filePath)) === ROOT;
  if (!isRootIndex) {
    return content;
  }
  if (content.includes("index-article.css")) return content;
  let out = content
    .replace(/<link rel="preload" href="\.\/Public\/Css\/hs-style\.css"[^>]*>\s*/g, "")
    .replace(/<link rel="preload" href="\.\/Public\/Css\/lch-office\.css"[^>]*>\s*/g, "")
    .replace(/<link[^>]*href="\.\/Public\/Css\/hs-style\.css"[^>]*>\s*/g, "")
    .replace(/<link[^>]*href="\.\/Public\/Css\/lch-office\.css"[^>]*>\s*/g, "")
    .replace(
      /<link rel="preload" href="\.\/Public\/Fonts\/googleSans-Regular\.woff2"[^>]*>\s*/g,
      ""
    );
  if (!out.includes("layout-shell.css")) {
    out = out.replace(
      /(<meta name="viewport"[^>]*>)/i,
      `$1\n  <link rel="stylesheet" href="./Public/Css/layout-shell.css">`
    );
  }
  out = out.replace(/<body>/i, '<body class="page-language">');
  out = out.replace(
    /\s*<style>[\s\S]*?#region-selector\.region-selector[\s\S]*?<\/style>\s*/i,
    "\n"
  );
  return out;
}

function deferHeadScripts(content) {
  if (!content.includes("index-article.css")) return content;
  const toDefer = [];
  let out = content.replace(/\s*<script src="\.\/Public\/Js\/utlParam\.js"><\/script>/g, () => {
    toDefer.push('<script defer src="./Public/Js/utlParam.js"></script>');
    return "";
  });
  out = out.replace(/\s*<script src="\.\/Public\/Js\/common\.js"><\/script>/g, () => {
    toDefer.push('<script defer src="./Public/Js/common.js"></script>');
    return "";
  });
  if (toDefer.length && out.includes("</body>")) {
    out = out.replace("</body>", `\n${toDefer.join("\n")}\n</body>`);
  }
  return out;
}

function removeFontAwesome(content) {
  let out = content.replace(
    /\s*<link[^>]*font-awesome[^>]*>\s*/gi,
    ""
  );
  if (out.includes("fab fa-")) {
    if (!out.includes("social-share.css")) {
      out = out.replace(
        /(<link[^>]*lch-office\.css"[^>]*>)/i,
        `$1\n    <link rel="stylesheet" href="./Public/Css/social-share.css">`
      );
    }
    for (const [cls, svg] of Object.entries(SOCIAL_SVG)) {
      out = out.replace(new RegExp(`<i class="${cls.replace(/-/g, "\\-")}"><\\/i>`, "g"), svg);
    }
  }
  return out;
}

function collectHtmlFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".git", "scripts", ".wrangler"].includes(entry.name)) continue;
      collectHtmlFiles(full, files);
    } else if (entry.isFile() && entry.name.endsWith(".html") && entry.name !== "header.html") {
      files.push(full);
    }
  }
  return files;
}

function main() {
  trimSiteIconsSvg();
  writeHeaderFragments();

  const files = collectHtmlFiles(ROOT);
  let updated = 0;

  for (const file of files) {
    const rel = path.relative(ROOT, file);
    let content = fs.readFileSync(file, "utf8");
    const original = content;

    if (/\bid\s*=\s*["']header["']/i.test(content)) {
      content = refreshInlinedHeaders(content, getLocaleFromFile(rel));
    }
    content = optimizeArticleIndexCss(content);
    content = optimizeRootIndexCss(content, file);
    content = deferHeadScripts(content);
    content = removeFontAwesome(content);

    if (content !== original) {
      fs.writeFileSync(file, content, "utf8");
      updated++;
      console.log(`  updated: ${rel}`);
    }
  }

  console.log(`\nOptimized ${updated} HTML files.`);
  for (const f of ["Public/Css/layout-shell.css", "Public/svg/site-icons.svg", "_headers"]) {
    const kb = (fs.statSync(path.join(ROOT, f)).size / 1024).toFixed(1);
    console.log(`  ${f}: ${kb} KB`);
  }
}

main();
