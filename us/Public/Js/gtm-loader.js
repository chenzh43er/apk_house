(function(w, d, s, l, i) {
    // 初始化 dataLayer
    w[l] = w[l] || [];
    w[l].push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });

    // 动态加载 gtm.js 脚本
    var f = d.getElementsByTagName(s)[0];
    var j = d.createElement(s);
    var dl = l != 'dataLayer' ? '&l=' + l : '';
    j.async = true;
    j.src = 'https://www.googletagmanager.com/gtm.js?id=' + i + dl;
    f.parentNode.insertBefore(j, f);

    // 动态插入 <noscript> 中的 <iframe>
    function insertNoScriptIframe() {
        var iframe = d.createElement('iframe');
        iframe.src = 'https://www.googletagmanager.com/ns.html?id=' + i;
        iframe.height = 0;
        iframe.width = 0;
        iframe.style.display = 'none';
        iframe.style.visibility = 'hidden';
        d.body.appendChild(iframe);
    }

    // 等待页面加载完成再插入 iframe
    if (d.readyState === 'complete') {
        insertNoScriptIframe();
    } else {
        w.addEventListener('load', insertNoScriptIframe);
    }
})(window, document, 'script', 'dataLayer', 'GTM-T9HH2RD5');
