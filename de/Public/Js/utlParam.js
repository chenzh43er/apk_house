document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);

    // ✅ 要保留的参数
    const keysToKeep = ['token', 'source', 'campaign', 'content', 'country', 'keyword', 'lang', 'medium'];

    // ✅ 提取当前 URL 上存在的参数
    const keepParams = new URLSearchParams();
    keysToKeep.forEach(key => {
        if (params.has(key)) {
            keepParams.set(key, params.get(key));
        }
    });

    if (keepParams.toString() === '') return; // 没有要保留的参数直接退出

    // ===== 工具函数：补齐 URL 参数 =====
    function appendParams(url) {
        try {
            const targetUrl = new URL(url, window.location.origin);
            keysToKeep.forEach(key => {
                if (keepParams.has(key) && !targetUrl.searchParams.has(key)) {
                    targetUrl.searchParams.set(key, keepParams.get(key));
                }
            });
            return targetUrl.toString();
        } catch {
            return url;
        }
    }

    // ===== 修复 <a> 标签 href =====
    function fixAnchor(a) {
        if (a.hasAttribute('href')) {
            try {
                const newHref = appendParams(a.href);
                if (newHref !== a.href) {
                    a.href = newHref;
                }
            } catch {}
        }
    }

    // ===== 初始页面处理 =====
    document.querySelectorAll('a[href]').forEach(fixAnchor);

    // ===== 懒加载监听：MutationObserver =====
    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) {
                    if (node.tagName === 'A') {
                        fixAnchor(node);
                    } else {
                        node.querySelectorAll && node.querySelectorAll('a[href]').forEach(fixAnchor);
                    }
                }
            });
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // ===== 劫持 location.assign/replace/href =====
    function patchLocationMethod(method) {
        const original = window.location[method];
        window.location[method] = function (url) {
            if (typeof url === 'string') {
                url = appendParams(url);
            }
            return original.call(window.location, url);
        };
    }
    ['assign', 'replace'].forEach(patchLocationMethod);

    // 劫持 location.href 赋值
    const hrefDescriptor = Object.getOwnPropertyDescriptor(Location.prototype, 'href');
    Object.defineProperty(window.location, 'href', {
        set(url) {
            hrefDescriptor.set.call(window.location, appendParams(url));
        },
        get() {
            return hrefDescriptor.get.call(window.location);
        }
    });

    // ===== 劫持 history.pushState/replaceState =====
    ['pushState', 'replaceState'].forEach(method => {
        const original = history[method];
        history[method] = function (state, title, url) {
            if (typeof url === 'string') {
                url = appendParams(url);
            }
            return original.call(history, state, title, url);
        };
    });
});
