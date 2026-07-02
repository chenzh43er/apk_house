import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { DEFAULT_HEADERS } from './constants.mjs';

function resolveProxyUrl(explicit) {
  return explicit
    || process.env.CRAIGSLIST_PROXY
    || process.env.HTTPS_PROXY
    || process.env.https_proxy
    || process.env.HTTP_PROXY
    || process.env.http_proxy
    || '';
}

function randomFileName(ext = '.jpg') {
  return `${randomBytes(16).toString('hex')}${ext}`;
}

function extFromUrl(url) {
  const match = String(url).match(/\.(jpe?g|png|webp)(?:\?|$)/i);
  return match ? `.${match[1].toLowerCase()}` : '.jpg';
}

async function downloadRemoteImage(url, destPath, options = {}) {
  const proxyUrl = resolveProxyUrl(options.proxy);
  const fetchOptions = {
    headers: {
      ...DEFAULT_HEADERS,
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      Referer: options.referer || 'https://www.craigslist.org/'
    }
  };
  if (proxyUrl) fetchOptions.dispatcher = new ProxyAgent(proxyUrl);

  const res = await undiciFetch(url, fetchOptions);
  if (!res.ok) {
    throw new Error(`Image download failed HTTP ${res.status} for ${url}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.slice(0, 15).toString('utf8').includes('<!DOCTYPE html')) {
    throw new Error(`Image download returned HTML for ${url}`);
  }
  fs.writeFileSync(destPath, buffer);
}

import { downloadImageBuffer, withDetailPage } from './browser.mjs';

async function writeImage(source, destPath, options = {}) {
  if (source.startsWith('http')) {
    if (options.downloadImage) {
      const buffer = await options.downloadImage(source);
      fs.writeFileSync(destPath, buffer);
      return;
    }
    if (options.useBrowser) {
      const buffer = await downloadImageBuffer(source, {
        proxy: options.proxy,
        referer: options.referer
      });
      fs.writeFileSync(destPath, buffer);
      return;
    }
    await downloadRemoteImage(source, destPath, options);
  } else if (fs.existsSync(source)) {
    fs.copyFileSync(source, destPath);
  } else {
    throw new Error(`Missing image source: ${source}`);
  }
}

export async function saveListingImages(imageUrls, options = {}) {
  const mainpic = options.mainpic;
  const imagesRoot = options.imagesDir;
  const folder = path.join(imagesRoot, mainpic);
  fs.mkdirSync(folder, { recursive: true });

  const saved = [];

  for (const source of imageUrls) {
    const fileName = randomFileName(extFromUrl(source));
    const destPath = path.join(folder, fileName);

    try {
      await writeImage(source, destPath, options);
      saved.push(fileName);
    } catch {
      continue;
    }
  }

  return saved;
}
