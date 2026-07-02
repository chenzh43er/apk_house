import { chromium } from 'playwright';

let browser = null;
let context = null;

function parseProxy(proxyUrl) {
  if (!proxyUrl) return null;
  const url = new URL(proxyUrl);
  return {
    server: `${url.protocol}//${url.host}`,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined
  };
}

export async function initBrowser(options = {}) {
  if (context) return context;

  const launchOptions = {
    headless: options.headless !== false,
    args: ['--disable-blink-features=AutomationControlled']
  };

  const proxy = parseProxy(options.proxy);
  if (proxy) launchOptions.proxy = proxy;

  browser = await chromium.launch(launchOptions);
  context = await browser.newContext({
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1365, height: 900 }
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  return context;
}

function isBlockedHtml(html) {
  return /your request has been blocked|access denied|captcha/i.test(html);
}

function isTimeoutError(error) {
  const msg = String(error?.message || error);
  return /timeout|ERR_TIMED_OUT|ETIMEDOUT|ECONNRESET|ENOTFOUND|ECONNREFUSED/i.test(msg);
}

async function gotoWithRetry(page, url, options = {}) {
  const attempts = options.retries ?? 3;
  const timeoutMs = options.timeoutMs || 90000;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await page.goto(url, {
        waitUntil: options.waitUntil || 'domcontentloaded',
        timeout: timeoutMs
      });
    } catch (error) {
      lastError = error;
      if (!isTimeoutError(error) || attempt === attempts) throw error;
      console.warn(`Retry ${attempt}/${attempts - 1} after timeout: ${url}`);
      await page.waitForTimeout(2000 * attempt);
    }
  }

  throw lastError;
}

export async function withDetailPage(url, options, handler) {
  const ctx = await initBrowser(options);
  const page = await ctx.newPage();
  const capturedImages = new Map();

  page.on('response', async (response) => {
    try {
      const responseUrl = response.url();
      if (!responseUrl.includes('images.craigslist.org') || !response.ok()) return;
      if (!/\.(jpe?g|png|webp)(\?|$)/i.test(responseUrl)) return;
      const body = await response.body();
      if (body.slice(0, 20).toString('utf8').includes('<!DOCTYPE html')) return;
      capturedImages.set(responseUrl, body);
    } catch {
      // ignore aborted responses
    }
  });

  try {
    const response = await gotoWithRetry(page, url, {
      timeoutMs: options.timeoutMs || 90000,
      retries: options.retries ?? 3
    });

    await page.waitForTimeout(options.waitMs ?? 3000);

    // Open gallery thumbs if present to load all images
    const thumbCount = await page.locator('img[src*="images.craigslist.org"]').count();
    for (let i = 0; i < Math.min(thumbCount, 20); i += 1) {
      try {
        await page.locator('img[src*="images.craigslist.org"]').nth(i).click({ timeout: 2000 });
        await page.waitForTimeout(300);
      } catch {
        break;
      }
    }

    const html = await page.content();

    if (!response || !response.ok() || isBlockedHtml(html)) {
      const err = new Error(`Browser blocked or failed for ${url}`);
      err.blocked = true;
      throw err;
    }

    const downloadImage = async (imageUrl) => {
      if (capturedImages.has(imageUrl)) return Buffer.from(capturedImages.get(imageUrl));
      const matched = [...capturedImages.entries()].find(([key]) => key.split('?')[0] === imageUrl.split('?')[0]);
      if (matched) return Buffer.from(matched[1]);
      throw new Error(`Image not captured: ${imageUrl}`);
    };

    return await handler({ html, downloadImage, capturedImages, page });
  } finally {
    await page.close();
  }
}

export async function fetchHtml(url, options = {}) {
  return withDetailPage(url, options, async ({ html }) => html);
}

export async function fetchSearchPage(url, options = {}) {
  const ctx = await initBrowser(options);
  const page = await ctx.newPage();
  const sapiPayloads = [];

  page.on('response', async (response) => {
    try {
      const responseUrl = response.url();
      if (!responseUrl.includes('sapi.craigslist.org') || !responseUrl.includes('/postings/search')) return;
      if (!response.ok()) return;
      const contentType = response.headers()['content-type'] || '';
      if (!contentType.includes('json')) return;
      sapiPayloads.push(await response.json());
    } catch {
      // ignore aborted responses
    }
  });

  try {
    const response = await gotoWithRetry(page, url, {
      timeoutMs: options.timeoutMs || 90000,
      retries: options.retries ?? 3,
      waitUntil: 'domcontentloaded'
    });

    await page.waitForTimeout(options.waitMs ?? 6000);

    for (let i = 0; i < (options.scrollSteps ?? 4); i += 1) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(options.scrollWaitMs ?? 1200);
    }

    const html = await page.content();

    if (!response || !response.ok() || isBlockedHtml(html)) {
      const err = new Error(`Browser blocked or failed for ${url}`);
      err.blocked = true;
      throw err;
    }

    return { html, sapiPayloads };
  } finally {
    await page.close();
  }
}

export async function downloadImageBuffer(url, options = {}) {
  const ctx = await initBrowser(options);
  const response = await ctx.request.get(url, {
    headers: {
      Referer: options.referer || 'https://www.craigslist.org/',
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
    },
    timeout: options.timeoutMs || 60000
  });

  if (!response.ok()) {
    throw new Error(`Image HTTP ${response.status()} for ${url}`);
  }

  const buffer = Buffer.from(await response.body());
  if (buffer.slice(0, 20).toString('utf8').includes('<!DOCTYPE html')) {
    throw new Error(`Image response was HTML for ${url}`);
  }

  return buffer;
}

export async function closeBrowser() {
  if (context) {
    await context.close();
    context = null;
  }
  if (browser) {
    await browser.close();
    browser = null;
  }
}
