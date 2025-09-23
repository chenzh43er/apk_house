document.addEventListener('DOMContentLoaded', () => {
    const keysToKeep = ['token', 'source', 'campaign', 'content', 'country', 'keyword', 'lang', 'medium'];
    const params = new URLSearchParams(window.location.search);

    const keepParams = new URLSearchParams();
    keysToKeep.forEach(key => {
        if (params.has(key)) keepParams.set(key, params.get(key));
    });
    if (keepParams.toString() === '') return;

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
                if (newHref !== a.href) a.href = newHref;
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
                    if (node.tagName === 'A') fixAnchor(node);
                    else node.querySelectorAll && node.querySelectorAll('a[href]').forEach(fixAnchor);
                }
            });
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // ===== 劫持 location.assign / replace =====
    ['assign', 'replace'].forEach(method => {
        const original = window.location[method];
        window.location[method] = function(url) {
            if (typeof url === 'string') url = appendParams(url);
            return original.call(window.location, url);
        };
    });

    // ===== 劫持 history.pushState / replaceState =====
    ['pushState', 'replaceState'].forEach(method => {
        const original = history[method];
        history[method] = function(state, title, url) {
            if (typeof url === 'string') url = appendParams(url);
            return original.call(history, state, title, url);
        };
    });

    // ===== 定时拦截 window.location.href 直接赋值 =====
    let lastHref = window.location.href;
    setInterval(() => {
        if (window.location.href !== lastHref) {
            const newHref = appendParams(window.location.href);
            if (newHref !== window.location.href) {
                window.location.replace(newHref); // 保证不会产生新的 history
            }
            lastHref = window.location.href;
        }
    }, 50);
});
