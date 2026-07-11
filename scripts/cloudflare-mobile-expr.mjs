/**
 * Cloudflare WAF 移动端识别表达式（Pro 可用字段）。
 *
 * 旧规则仅匹配 Mobile / Android / iPhone，会误把以下流量当成「非移动端」：
 * - iPad（桌面模式 UA 不含 Mobile）
 * - 微信 / Facebook 等应用内 WebView（常缺 Sec-Fetch-*）
 * - 带 Client Hints 但 UA 精简的现代浏览器
 */

/** UA 子串，覆盖常见手机 / 平板 / 移动 WebView */
export const MOBILE_UA_MARKERS = [
  "Mobile",
  "Android",
  "iPhone",
  "iPod",
  "iPad",
  "webOS",
  "BlackBerry",
  "Opera Mini",
  "Opera Mobi",
  "IEMobile",
  "Windows Phone",
  "Silk/", // Amazon Silk (Kindle Fire)
];

/** 任一 UA 标记命中即视为移动端 */
export function mobileUaExpr() {
  return MOBILE_UA_MARKERS.map((m) => `(http.user_agent contains "${m}")`).join(
    " or "
  );
}

/** Client Hints：Chrome / Edge 等会发送 sec-ch-ua-mobile: ?1 */
export function mobileClientHintExpr() {
  return '(http.request.headers["sec-ch-ua-mobile"][0] eq "?1")';
}

/** 综合移动端判定（UA + Client Hints） */
export function isMobileRequestExpr() {
  return `(${mobileUaExpr()} or ${mobileClientHintExpr()})`;
}

/**
 * 「非移动端 → Managed Challenge」规则表达式。
 * 仅 challenge 明确非移动且非 verified bot 的请求。
 */
export function nonMobileChallengeExpr() {
  return `(not (${mobileUaExpr()} or ${mobileClientHintExpr()})) and (not cf.client.bot)`;
}

/** 真实浏览器导航（含 Sec-Fetch；桌面 / 移动 Safari、Chrome 均会发送） */
export const BROWSER_NAV_EXPR =
  '(http.sec_fetch_mode eq "navigate" and http.sec_fetch_dest eq "document")';

/**
 * 应跳过 SBFM / Managed Challenge 的「真实用户」信号：
 * 浏览器导航 或 已识别的移动端 UA / Client Hints。
 */
export function realUserBypassExpr() {
  return `(${BROWSER_NAV_EXPR} or ${isMobileRequestExpr()})`;
}

/** 判断现有 WAF 规则是否为「非移动端 Challenge」误杀规则 */
export function isLegacyNonMobileChallengeRule(rule) {
  if (!rule || rule.action !== "managed_challenge") return false;
  if (
    rule.ref === "challenge_non_mobile_ua" ||
    rule.description === "Challenge non-mobile User-Agent"
  ) {
    return true;
  }
  const expr = rule.expression || "";
  return (
    expr.includes("not http.user_agent contains") &&
    expr.includes("Mobile") &&
    (expr.includes("Android") || expr.includes("iPhone"))
  );
}
