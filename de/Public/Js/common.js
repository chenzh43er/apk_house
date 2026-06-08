function getLangFromPath() {
    const pathSegments = window.location.pathname.split('/');
    return pathSegments[1]; // 假设语言代码总是在第一个路径段
}

function returnAdvWord(){
    return `<p style="text-align: center;text-align: center; line-height: 100px; margin: 0;width: 100%">Advertisment</p>`
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