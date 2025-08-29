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
    return "Freerentinghouse.info"
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

    const bottom_div = document.getElementById('bottom_div')
    if (bottom_div) {
        const observer = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    loadPost_adv2(entry.target);
                    obs.unobserve(entry.target);
                    googletag.cmd.push(function() { googletag.display('div-gpt-ad-1752991223651-0'); });
                }
            });
        }, {
            rootMargin: '5px',
        });
        observer.observe(bottom_div);
    }
}
