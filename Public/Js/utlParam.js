document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);

    // 要保留的参数名
    const keysToKeep = [
        'token', 'source', 'campaign', 'content',
        'country', 'keyword', 'lang', 'medium'
    ];

    // 提取需要保留的参数
    const preservedParams = new URLSearchParams();
    keysToKeep.forEach(key => {
        const value = params.get(key);
        if (value !== null) preservedParams.set(key, value);
    });

    if (![...preservedParams].length) return; // 没有参数就退出

    // 构造带参数的新 URL
    function withPreservedParams(url) {
        try {
            const fullUrl = new URL(url, window.location.origin);
            preservedParams.forEach((v, k) => {
                if (!fullUrl.searchParams.has(k)) {
                    fullUrl.searchParams.set(k, v);
                }
            });
            return fullUrl.toString();
        } catch {
            return url; // 非正常 URL，原样返回
        }
    }

    // =========================
    // 1️⃣ 处理 <a> 链接
    // =========================
    function processLink(link) {
        try {
            const url = new URL(link.href, window.location.origin);

            // 跳过特殊协议
            if (['mailto:', 'tel:', 'javascript:'].includes(url.protocol)) return;

            preservedParams.forEach((v, k) => {
                if (!url.searchParams.has(k)) {
                    url.searchParams.set(k, v);
                }
            });

            link.href = url.toString();
        } catch {
            // 忽略非法 URL
        }
    }

    function updateLinks(root = document) {
        root.querySelectorAll('a[href]').forEach(processLink);
    }

    updateLinks();

    // 观察动态 DOM 变化
    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) {
                    if (node.tagName === 'A') {
                        processLink(node);
                    } else {
                        node.querySelectorAll('a[href]').forEach(processLink);
                    }
                }
            });
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // =========================
    // 2️⃣ 拦截 JS 跳转
    // =========================

    // assign
    const _assign = window.location.assign;
    window.location.assign = function(url) {
        return _assign.call(window.location, withPreservedParams(url));
    };

    // replace
    const _replace = window.location.replace;
    window.location.replace = function(url) {
        return _replace.call(window.location, withPreservedParams(url));
    };

    // href 直接赋值
    Object.defineProperty(window.location, 'href', {
        set: function(url) {
            _assign.call(window.location, withPreservedParams(url));
        }
    });

    // open
    const _open = window.open;
    window.open = function(url, target, features) {
        return _open.call(window, withPreservedParams(url), target, features);
    };

    // pushState
    const _pushState = history.pushState;
    history.pushState = function(state, title, url) {
        return _pushState.call(history, state, title, url ? withPreservedParams(url) : url);
    };

    // replaceState
    const _replaceState = history.replaceState;
    history.replaceState = function(state, title, url) {
        return _replaceState.call(history, state, title, url ? withPreservedParams(url) : url);
    };
});
