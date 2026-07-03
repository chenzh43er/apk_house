import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { DEFAULT_HEADERS } from './constants.mjs';

function resolveProxyUrl(explicit) {
  if (explicit) return explicit;
  return process.env.CRAIGSLIST_PROXY
    || process.env.HTTPS_PROXY
    || process.env.https_proxy
    || process.env.HTTP_PROXY
    || process.env.http_proxy
    || '';
}

function buildBrowserHeaders(referer, accept) {
  return {
    ...DEFAULT_HEADERS,
    Accept: accept || 'application/json,text/plain,*/*',
    'Accept-Encoding': 'identity',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
    ...(referer ? { Referer: referer, Origin: new URL(referer).origin } : {})
  };
}

export async function craigslistFetch(url, options = {}) {
  const proxyUrl = resolveProxyUrl(options.proxy);
  const referer = options.referer || '';
  const headers = {
    ...buildBrowserHeaders(referer, options.accept),
    ...(options.headers || {})
  };

  if (options.mode === 'document') {
    headers['Sec-Fetch-Dest'] = 'document';
    headers['Sec-Fetch-Mode'] = 'navigate';
    headers['Sec-Fetch-Site'] = 'none';
    headers['Sec-Fetch-User'] = '?1';
    headers['Upgrade-Insecure-Requests'] = '1';
    delete headers.Origin;
  }

  const fetchOptions = {
    method: options.method || 'GET',
    headers,
    redirect: 'follow'
  };

  if (proxyUrl) {
    fetchOptions.dispatcher = new ProxyAgent(proxyUrl);
  }

  const res = await undiciFetch(url, fetchOptions);
  const text = await res.text();

  return { res, text, proxyUrl };
}

export function isBlockedResponse(status, text) {
  if (status === 403 || status === 429) return true;
  if (status === 404) return false;
  return /your request has been blocked|access denied|captcha/i.test(text);
}

export function isGoneResponse(status) {
  return status === 404 || status === 410;
}

export function buildBlockedSearchUrl(context = {}) {
  const city = context.city || 'sfbay';
  const category = context.category || 'apa';
  const params = new URLSearchParams();
  if (context.postal) params.set('postal', context.postal);
  if (context.searchDistance) params.set('search_distance', String(context.searchDistance));
  params.set('hasPic', '1');
  params.set('sort', 'date');
  const qs = params.toString();
  return `https://${city}.craigslist.org/search/${category}${qs ? `?${qs}` : ''}`;
}

export function timeoutHelp(context = {}) {
  const searchUrl = buildBlockedSearchUrl(context);
  const htmlFile = context.htmlFile || `data/craigslist/${context.city || 'sfbay'}-${context.category || 'apa'}.html`;
  const scrapeCmd = [
    'node scripts/craigslist/scrape.mjs',
    `--city ${context.city || 'sfbay'}`,
    context.displayState ? `--state "${context.displayState}"` : '--state California',
    `--html-file ${htmlFile}`,
    `--max ${context.max || 50}`
  ].join(' ');

  return [
    'Craigslist search page timed out from this network (cannot reach sfbay.craigslist.org).',
    'This is usually a regional network block, not a script bug.',
    '',
    'Option A — US VPN or residential proxy (recommended for live scrape):',
    '  set CRAIGSLIST_PROXY=http://user:pass@us-host:port',
    '  node scripts/craigslist/scrape.mjs --city sfbay --state California --postal 94102 --max 5',
    '',
    'Option B — offline search HTML (works without proxy on detail scrape):',
    '  1. Open US VPN in your browser',
    `  2. Visit ${searchUrl}`,
    '  3. Wait for listings, Ctrl+S save as "Webpage, HTML only"',
    `  4. Save to ${htmlFile}`,
    `  5. Run: ${scrapeCmd}`,
    '',
    'Option C — scrape known listing URLs directly (skip search):',
    '  node scripts/craigslist/scrape.mjs --city sfbay --state California --max 5 --url "https://www.craigslist.org/view/d/..."'
  ].join('\n');
}

export function blockedHelp(context = {}) {
  const proxyUrl = context.proxyUrl || '';
  const searchUrl = buildBlockedSearchUrl(context);
  const htmlFile = context.htmlFile || `data/craigslist/${context.city || 'sfbay'}-${context.category || 'apa'}.html`;
  const scrapeCmd = [
    'node scripts/craigslist/scrape.mjs',
    `--city ${context.city || 'sfbay'}`,
    context.displayState ? `--state "${context.displayState}"` : '--state California',
    context.postal ? `--postal ${context.postal}` : '--postal 94102',
    `--html-file ${htmlFile}`,
    `--max ${context.max || 50}`,
    `--output data/craigslist/${context.city || 'sfbay'}-${context.category || 'apa'}.json`
  ].join(' ');

  const lines = [
    'Craigslist blocked automated requests from this IP (HTTP 403).',
    'Live scraping will not work from this network. Use the browser + offline parse flow:',
    '',
    '  1. Connect US VPN in browser',
    `  2. Open ${searchUrl}`,
    '  3. Wait for listings to load, then Ctrl+S save as HTML',
    `  4. Put file at ${htmlFile}`,
    '  5. Run:',
    `     ${scrapeCmd}`,
    '',
    'Alternative: US residential proxy',
    '  set CRAIGSLIST_PROXY=http://user:pass@host:port',
    '  then retry your live scrape command with --proxy ...'
  ];
  if (proxyUrl) lines.push('', `(proxy in use: ${proxyUrl.replace(/:[^:@/]+@/, ':***@')})`);
  return lines.join('\n');
}
