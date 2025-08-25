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