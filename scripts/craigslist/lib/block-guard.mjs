import { isBrowserClosedError } from './browser.mjs';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let consecutiveBlocks = 0;
let cooldownUntil = 0;
let mutex = Promise.resolve();

function withLock(fn) {
  const run = mutex.then(() => fn());
  mutex = run.catch(() => {});
  return run;
}

export async function waitForCooldown() {
  const wait = cooldownUntil - Date.now();
  if (wait > 0) {
    console.warn(`[BlockGuard] Waiting ${Math.round(wait / 1000)}s before next request...`);
    await sleep(wait);
  }
}

export function recordListingSuccess() {
  consecutiveBlocks = 0;
}

export async function recordListingBlock(options = {}) {
  const threshold = options.threshold ?? 4;
  const waitMs = options.blockWaitMs ?? 90000;

  consecutiveBlocks += 1;

  if (consecutiveBlocks < threshold) return;

  consecutiveBlocks = 0;
  cooldownUntil = Date.now() + waitMs;

  await withLock(async () => {
    console.warn(
      `[BlockGuard] ${threshold} consecutive blocks — waiting for active pages, then pausing ${Math.round(waitMs / 1000)}s`
    );
    const { resetBrowser } = await import('./browser.mjs');
    await resetBrowser();
  });
}

export function isBlockedError(error) {
  return Boolean(error?.blocked)
    || isBrowserClosedError(error)
    || /blocked or failed|blocked for|access denied|captcha|HTTP 403|HTTP 429/i.test(String(error?.message || error));
}
