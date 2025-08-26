document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);

    // 指定要传递的参数名列表（可扩展）
    const keysToKeep = ['token', 'source'];

    // 提取所有需要保留的参数
    const preservedParams = new URLSearchParams();
    keysToKeep.forEach(key => {
        const value = params.get(key);
        if (value !== null) {
            preservedParams.set(key, value);
        }
    });

    if ([...preservedParams].length === 0) return; // 没有参数就退出

    // 更新链接参数
    function updateLinks(root = document) {
        root.querySelectorAll('a[href]').forEach(link => {
            try {
                const url = new URL(link.href, window.location.origin);
                keysToKeep.forEach(key => {
                    if (preservedParams.has(key)) {
                        url.searchParams.set(key, preservedParams.get(key));
                    }
                });
                link.href = url.toString();
            } catch (e) {
                // 忽略非法 URL（如 mailto:, tel: 等）
            }
        });
    }

    updateLinks();

    // 持续监听新加入的 a 标签（懒加载等）
    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) {
                    if (node.tagName === 'A') {
                        updateLinks(node);
                    } else {
                        updateLinks(node); // 递归查找内部 a
                    }
                }
            });
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
});



document.addEventListener('DOMContentLoaded', () => {
    const links = document.querySelectorAll('a');
    //console.log('找到链接数量:', links.length);

    links.forEach(link => {
        //console.log('原始链接:', link.href);
    });
});
