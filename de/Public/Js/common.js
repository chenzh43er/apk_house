function isGermanLocale(lang) {
    if (!lang) lang = getLangFromPath();
    return lang === "de" || lang === "de-ch-at";
}

function getLangFromPath() {
    const pathSegments = window.location.pathname.split('/');
    return pathSegments[1]; // 假设语言代码总是在第一个路径段
}

function returnAdvWord(){
    const label = isGermanLocale() ? "Werbung" : "Advertisment";
    return `<p style="text-align: center;text-align: center; line-height: 100px; margin: 0;width: 100%">${label}</p>`
}

function returnAdvTestWord(){
    return `<p style="text-align: center;text-align: center; line-height: 100px; margin: 0;width: 100%">ADV Test</p>`
}

function isMobile() {
    return window.matchMedia("only screen and (max-width: 768px)").matches;
}

function returnWebStr(){
    return "Apkintelligence.com"
}

function loadScript(src, callback) {
    let script = document.createElement("script");
    script.src = src;
    script.type = "text/javascript";
    script.async = true;

    script.onload = function () {
        ////console.log(`${src} 加载完成`);
        if (callback) callback(); // 加载完成后执行回调函数
    };

    script.onerror = function () {
        //console.error(`${src} 加载失败`);
    };

    document.head.appendChild(script); // 插入到 `head` 中
}

function ensureSupabase() {
    if (globalThis.supabase) return Promise.resolve();
    if (!globalThis._supabaseLoading) {
        globalThis._supabaseLoading = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = '/Public/Js/supabase.min.js';
            script.onload = resolve;
            script.onerror = () => reject(new Error('Failed to load supabase.min.js'));
            document.head.appendChild(script);
        });
    }
    return globalThis._supabaseLoading;
}

window.onscroll = null;

const keysToKeep = ['token','source','campaign','content','country','keyword','lang','medium'];
const params = new URLSearchParams(window.location.search);

const keepParams = new URLSearchParams();
keysToKeep.forEach(key => {
    if (params.has(key)) keepParams.set(key, params.get(key));
});

function appendParams(url) {
    try {
        const u = new URL(url, window.location.origin);
        keysToKeep.forEach(key => {
            if (keepParams.has(key) && !u.searchParams.has(key)) {
                u.searchParams.set(key, keepParams.get(key));
            }
        });
        return u.toString();
    } catch {
        return url;
    }
}

function buildFormHref(state, city, district, houseId, lang) {
    if (!lang) {
        lang = getLangFromPath();
    }

    let formHref = `./form.html?id=${encodeURIComponent(houseId || "")}&state=${encodeURIComponent(state || "")}&city=${encodeURIComponent(city || "")}&district=${encodeURIComponent(district || "")}`;

    if (lang === "de") {
        formHref = `/de/teach/state/${state}/${city}/${district}/${houseId}/form`;
    } else if (lang === "us") {
        formHref = `/us/teach/state/${state}/${city}/${district}/${houseId}/form`;
    } else if (lang === "de-ch-at") {
        formHref = `/de-ch-at/teach/state/${state}/${city}/${district}/${houseId}/form`;
    } else {
        formHref = `/teach/state/${state}/${city}/${district}/${houseId}/form`;
    }

    return formHref;
}

function buildTeachStatePath(lang, ...segments) {
    if (!lang) {
        lang = getLangFromPath();
    }
    const suffix = segments.length
        ? "/" + segments.map(function (s) { return encodeURIComponent(s); }).join("/")
        : "";
    if (lang === "de") {
        return "/de/teach/state" + suffix;
    }
    if (lang === "us") {
        return "/us/teach/state" + suffix;
    }
    if (lang === "de-ch-at") {
        return "/de-ch-at/teach/state" + suffix;
    }
    return "/teach/state" + suffix;
}

function bindDetailToFormLink(state, city, district, houseId, lang) {
    const toFormEl = document.getElementById("toForm");
    if (!toFormEl) {
        return;
    }

    const href = appendParams(buildFormHref(state, city, district, houseId, lang));
    toFormEl.href = href;
    toFormEl.dataset.formHref = href;

    if (toFormEl.dataset.formBound === "1") {
        return;
    }
    toFormEl.dataset.formBound = "1";

    toFormEl.addEventListener("click", function (e) {
        const current = this.getAttribute("href") || "";
        if (current === "javascript:;" || current === "#" || current.startsWith("javascript:")) {
            e.preventDefault();
            window.location.href = this.dataset.formHref || href;
        }
    });
}

/** 页面内嵌图片走 /cdn/；本地 dev R2 未绑定时回退到已部署 Pages 的 CDN 代理 */
function isLocalDev() {
    const h = window.location.hostname;
    return h === "127.0.0.1" || h === "localhost";
}

const CDN_DEV_ORIGIN = "https://main.apk-house.pages.dev";

const CDN_PROXY = {
    de: "/cdn/de/",
    us: "/cdn/us/",
    at: "/cdn/at/images/",
    ch: "/cdn/ch/images/",
};

function getCDNPrefix() {
    return isLocalDev() ? CDN_DEV_ORIGIN : "";
}

function getPicURL(lang, country) {
    if (!country) {
        country = new URLSearchParams(window.location.search).get("country");
    }
    const p = getCDNPrefix();
    if (lang === "de") return p + CDN_PROXY.de;
    if (lang === "us") return p + CDN_PROXY.us;
    if (lang === "de-ch-at" || country) {
        if (country === "de") return p + CDN_PROXY.de;
        if (country === "at") return p + CDN_PROXY.at;
        if (country === "ch") return p + CDN_PROXY.ch;
        return p + CDN_PROXY.de;
    }
    return p + CDN_PROXY.us;
}

function buildServerPic(picURL, mainpic, country) {
    if (!country) {
        country = new URLSearchParams(window.location.search).get("country");
    }
    if (country === "at" || country === "ch") return picURL;
    return picURL + mainpic + "/";
}

function needsNoReferrer(picURL) {
    return /^https:\/\/pic-(at|ch)\./.test(picURL);
}

function houseImgTag(src, alt, className) {
    const ref = needsNoReferrer(src) ? ' referrerpolicy="no-referrer"' : "";
    return `<img src="${src}" alt="${alt || ""}" class="${className || ""}"${ref}>`;
}

function withCountryQuery(url, country) {
    if (!country) {
        country = new URLSearchParams(window.location.search).get("country");
    }
    if (!country) return url;
    const sep = url.includes("?") ? "&" : "?";
    return url + sep + "country=" + encodeURIComponent(country);
}

function detailShareLabel(lang) {
    return lang === "de" || lang === "de-ch-at" ? "Diese Anzeige teilen" : "Share this listing";
}

function detailShareCopyLabel(lang) {
    return lang === "de" || lang === "de-ch-at" ? "Link kopieren" : "Copy link";
}

function detailShareCopiedLabel(lang) {
    return lang === "de" || lang === "de-ch-at" ? "Link kopiert" : "Link copied";
}

function detailShareEmailSubject(lang, title) {
    const name = title || "Apkintelligence";
    return lang === "de" || lang === "de-ch-at"
        ? `Wohnungsanzeige: ${name}`
        : `Housing listing: ${name}`;
}

function detailShareEmailBody(lang, pageUrl, title) {
    const name = title || "";
    if (lang === "de" || lang === "de-ch-at") {
        return name
            ? `Hallo,\n\nich möchte diese Wohnungsanzeige mit dir teilen:\n${name}\n\n${pageUrl}`
            : `Hallo,\n\nich möchte diese Wohnungsanzeige mit dir teilen:\n\n${pageUrl}`;
    }
    return name
        ? `Hi,\n\nI wanted to share this housing listing with you:\n${name}\n\n${pageUrl}`
        : `Hi,\n\nI wanted to share this housing listing with you:\n\n${pageUrl}`;
}

function detailShareTelegramText(lang, title) {
    const name = title || "";
    if (lang === "de" || lang === "de-ch-at") {
        return name ? `Wohnungsanzeige: ${name}` : "Wohnungsanzeige";
    }
    return name ? `Housing listing: ${name}` : "Housing listing";
}

function resolveDetailShareTitle(shareTitle) {
    if (shareTitle) return String(shareTitle).trim();
    const titleEl = document.getElementById("titleMessage");
    if (titleEl && titleEl.innerText) return titleEl.innerText.trim();
    return (document.title || "").replace(/\s*[-|].*$/, "").trim();
}

function buildDetailShareMarkup(pageUrl, lang, shareTitle) {
    if (!lang) lang = getLangFromPath();
    const title = resolveDetailShareTitle(shareTitle);
    const encoded = encodeURIComponent(pageUrl);
    const encodedTitle = encodeURIComponent(title);
    const label = detailShareLabel(lang);
    const copyLabel = detailShareCopyLabel(lang);
    const safeUrl = String(pageUrl).replace(/"/g, "&quot;");
    const emailSubject = encodeURIComponent(detailShareEmailSubject(lang, title));
    const emailBody = encodeURIComponent(detailShareEmailBody(lang, pageUrl, title));
    const telegramText = encodeURIComponent(detailShareTelegramText(lang, title));
    const emailLabel = lang === "de" || lang === "de-ch-at" ? "E-Mail" : "Email";
    const linkedinLabel = "LinkedIn";
    const telegramLabel = "Telegram";
    const redditLabel = "Reddit";

    return `
        <p class="share-label" id="lang_share">${label}</p>
        <div class="social-share">
            <div class="share-icons" role="list">
                <a class="social-btn facebook" role="listitem" href="https://www.facebook.com/sharer/sharer.php?u=${encoded}" title="Facebook" aria-label="Facebook" target="_blank" rel="noopener noreferrer">
                    <svg class="social-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                </a>
                <a class="social-btn twitter" role="listitem" href="https://twitter.com/intent/tweet?url=${encoded}&text=${encodedTitle}" title="X" aria-label="X" target="_blank" rel="noopener noreferrer">
                    <svg class="social-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </a>
                <a class="social-btn linkedin" role="listitem" href="https://www.linkedin.com/sharing/share-offsite/?url=${encoded}" title="${linkedinLabel}" aria-label="${linkedinLabel}" target="_blank" rel="noopener noreferrer">
                    <svg class="social-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                </a>
                <a class="social-btn whatsapp" role="listitem" href="https://api.whatsapp.com/send?text=${encodeURIComponent(title ? title + " " + pageUrl : pageUrl)}" title="WhatsApp" aria-label="WhatsApp" target="_blank" rel="noopener noreferrer">
                    <svg class="social-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
                </a>
                <a class="social-btn telegram" role="listitem" href="https://t.me/share/url?url=${encoded}&text=${telegramText}" title="${telegramLabel}" aria-label="${telegramLabel}" target="_blank" rel="noopener noreferrer">
                    <svg class="social-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                </a>
                <a class="social-btn pinterest" role="listitem" href="https://pinterest.com/pin/create/button/?url=${encoded}&description=${encodedTitle}" title="Pinterest" aria-label="Pinterest" target="_blank" rel="noopener noreferrer">
                    <svg class="social-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0a12 12 0 0 0-4.37 23.17c-.1-.94-.19-2.39.04-3.42l1.34-5.69s-.34-.68-.34-1.68c0-1.57.91-2.75 2.05-2.75.97 0 1.44.73 1.44 1.6 0 .97-.62 2.42-.94 3.77-.27 1.13.57 2.05 1.69 2.05 2.03 0 3.59-2.14 3.59-5.23 0-2.73-1.96-4.64-4.76-4.64-3.24 0-5.14 2.43-5.14 4.94 0 .97.37 2.02.85 2.59a.34.34 0 0 1 .08.32l-.31 1.24c-.05.2-.16.25-.37.15-1.37-.64-2.23-2.64-2.23-4.25 0-3.46 2.51-6.64 7.24-6.64 3.8 0 6.75 2.71 6.75 6.34 0 3.77-2.38 6.8-5.68 6.8-1.11 0-2.15-.58-2.51-1.26l-.68 2.6c-.25.96-.93 2.16-1.39 2.89A12 12 0 1 0 12 0z"/></svg>
                </a>
                <a class="social-btn messenger" role="listitem" href="https://www.messenger.com/t/?link=${encoded}" title="Messenger" aria-label="Messenger" target="_blank" rel="noopener noreferrer">
                    <svg class="social-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0C5.373 0 0 4.975 0 11.111c0 3.497 1.745 6.616 4.472 8.652V24l4.086-2.242c1.09.3 2.246.464 3.442.464 6.627 0 12-4.974 12-11.111C24 4.975 18.627 0 12 0zm1.191 14.963l-3.055-3.26-5.963 3.26L10.732 8l3.13 3.26L19.752 8l-6.561 6.963z"/></svg>
                </a>
                <a class="social-btn reddit" role="listitem" href="https://www.reddit.com/submit?url=${encoded}&title=${encodedTitle}" title="${redditLabel}" aria-label="${redditLabel}" target="_blank" rel="noopener noreferrer">
                    <svg class="social-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.133 4.87-7.004 4.87-3.871 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/></svg>
                </a>
                <a class="social-btn email" role="listitem" href="mailto:?subject=${emailSubject}&body=${emailBody}" title="${emailLabel}" aria-label="${emailLabel}">
                    <svg class="social-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/></svg>
                </a>
                <span class="share-icons__sep" aria-hidden="true"></span>
                <button type="button" class="share-copy-btn" data-url="${safeUrl}" aria-label="${copyLabel}" title="${copyLabel}">
                    <svg class="social-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                </button>
            </div>
        </div>`;
}

function bindDetailShareCopy(root, lang) {
    if (!root) return;
    if (!lang) lang = getLangFromPath();
    const btn = root.querySelector(".share-copy-btn");
    if (!btn || btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    const defaultLabel = detailShareCopyLabel(lang);
    const copiedLabel = detailShareCopiedLabel(lang);

    btn.addEventListener("click", async function () {
        const url = this.dataset.url || window.location.href;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(url);
            } else {
                const ta = document.createElement("textarea");
                ta.value = url;
                ta.setAttribute("readonly", "");
                ta.style.position = "absolute";
                ta.style.left = "-9999px";
                document.body.appendChild(ta);
                ta.select();
                document.execCommand("copy");
                document.body.removeChild(ta);
            }
            this.classList.add("is-copied");
            this.setAttribute("aria-label", copiedLabel);
            this.setAttribute("title", copiedLabel);
            clearTimeout(this._copyTimer);
            this._copyTimer = setTimeout(() => {
                this.classList.remove("is-copied");
                this.setAttribute("aria-label", defaultLabel);
                this.setAttribute("title", defaultLabel);
            }, 2000);
        } catch (err) {
            console.error("Copy link failed:", err);
        }
    });
}

function renderDetailShareBar(container, pageUrl, lang, shareTitle) {
    if (!container) return;
    if (!lang) lang = getLangFromPath();
    container.classList.add("detail-share-bar");
    container.innerHTML = buildDetailShareMarkup(pageUrl, lang, shareTitle);
    bindDetailShareCopy(container, lang);
}

function escapeHtmlAttr(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function getGalleryMoreLabel(count, lang) {
    const isDe = lang === "de" || lang === "de-ch-at";
    if (isDe) {
        return count === 1 ? "+1 Foto" : `+${count} Fotos`;
    }
    return count === 1 ? "+1 photo" : `+${count} photos`;
}

function renderDetailGallery(container, pics, baseUrl, altText, lang) {
    const el = typeof container === "string"
        ? document.querySelector(container)
        : container;
    if (!el) return;

    if (!lang) lang = getLangFromPath();

    el.className = "img-box detail-gallery";
    el.innerHTML = "";
    el.style.display = "";

    let picsArr = pics;
    if (typeof pics === "string") {
        try {
            picsArr = JSON.parse(pics);
        } catch {
            picsArr = [];
        }
    }
    if (!Array.isArray(picsArr) || picsArr.length === 0) {
        el.style.display = "none";
        return;
    }

    const alt = escapeHtmlAttr(altText || "");
    const base = baseUrl || "";
    const imgTag = (filename, extraClass) =>
        `<img class="provided-img${extraClass ? " " + extraClass : ""}" onclick="openModal(this)" src="${base + filename}" alt="${alt}">`;

    const n = picsArr.length;

    if (n === 1) {
        el.classList.add("detail-gallery--single");
        el.innerHTML = imgTag(picsArr[0]);
        return;
    }

    if (n === 2) {
        el.classList.add("detail-gallery--double");
        el.innerHTML = imgTag(picsArr[0]) + imgTag(picsArr[1]);
        return;
    }

    el.classList.add(
        n === 3 ? "detail-gallery--triple" :
        n === 4 ? "detail-gallery--quad" :
        "detail-gallery--multi"
    );

    let sideHtml = "";
    if (n === 3) {
        sideHtml = imgTag(picsArr[1]) + imgTag(picsArr[2]);
    } else if (n === 4) {
        sideHtml = imgTag(picsArr[1]) + imgTag(picsArr[2]) + imgTag(picsArr[3]);
    } else {
        const hiddenCount = n - 3;
        const moreLabel = escapeHtmlAttr(getGalleryMoreLabel(hiddenCount, lang));
        sideHtml =
            imgTag(picsArr[1]) +
            `<div class="detail-gallery__more-cell">` +
            imgTag(picsArr[2]) +
            `<button type="button" class="detail-gallery__more" onclick="openModal(this.previousElementSibling)" aria-label="${moreLabel}">` +
            `<span>${moreLabel}</span></button>` +
            `</div>`;
    }

    el.innerHTML =
        `<div class="detail-gallery__main">${imgTag(picsArr[0])}</div>` +
        `<div class="detail-gallery__side">${sideHtml}</div>`;
}

function getHouseCountCopy(lang, count) {
    const isDe = lang === "de" || lang === "de-ch-at";
    const locales = { de: "de-DE", us: "en-US", "de-ch-at": "de-CH" };
    const locale = locales[lang] || "en-US";

    if (count == null) {
        return {
            formatted: "…",
            label: isDe ? "Angebote" : "listings",
            ariaLabel: isDe ? "Anzahl wird geladen" : "Loading listing count",
            isLoading: true,
            isEmpty: false
        };
    }

    const n = Number(count) || 0;
    if (!n) {
        return {
            formatted: "",
            label: isDe ? "Keine Angebote" : "No listings",
            ariaLabel: isDe ? "Keine Angebote verfügbar" : "No listings available",
            isLoading: false,
            isEmpty: true
        };
    }

    const formatted = n.toLocaleString(locale);
    const label = isDe
        ? (n === 1 ? "Angebot" : "Angebote")
        : (n === 1 ? "listing" : "listings");

    return {
        formatted,
        label,
        ariaLabel: formatted + " " + label,
        isLoading: false,
        isEmpty: false
    };
}

function buildPickerTileHtml(name, count, lang) {
    const copy = getHouseCountCopy(lang, count);
    const countClasses = ["state-tile__count"];
    if (copy.isLoading) countClasses.push("is-loading");
    if (copy.isEmpty) countClasses.push("is-empty");

    let badgeHtml = `<span class="state-tile__count-badge${copy.isEmpty ? " state-tile__count-badge--empty" : ""}">`;
    if (!copy.isEmpty && copy.formatted) {
        badgeHtml += `<span class="state-tile__count-num">${copy.formatted}</span>`;
    }
    badgeHtml += `<span class="state-tile__count-label">${copy.label}</span></span>`;

    return `<span class="state-tile selectLidiv">` +
        `<span class="state-tile__text text-wrapper">${name}</span>` +
        `<span class="${countClasses.join(" ")}" aria-live="polite" aria-label="${copy.ariaLabel}">` +
        badgeHtml +
        `</span></span>`;
}

function updatePickerTileCount(linkEl, count, lang) {
    if (!linkEl) return;
    const tile = linkEl.querySelector(".state-tile");
    if (!tile) return;

    const oldCount = tile.querySelector(".state-tile__count");
    if (oldCount) oldCount.remove();

    const wrapper = document.createElement("span");
    wrapper.innerHTML = buildPickerTileHtml("", count, lang);
    const newCount = wrapper.querySelector(".state-tile__count");
    if (newCount) tile.appendChild(newCount);
}

function applyPickerCountLegend(lang) {
    const el = document.getElementById("state_picker_legend");
    if (!el) return;
    const isDe = lang === "de" || lang === "de-ch-at";
    if (isDe) {
        el.innerHTML = 'Die Badge zeigt verfügbare Angebote, z. B. <span class="state-picker-legend__sample"><span>676</span> Angebote</span>';
    } else {
        el.innerHTML = 'The badge shows available listings, e.g. <span class="state-picker-legend__sample"><span>676</span> listings</span>';
    }
}