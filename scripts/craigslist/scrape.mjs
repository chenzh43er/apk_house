#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blockedHelp } from './lib/http.mjs';
import { closeBrowser } from './lib/browser.mjs';
import {
  extractListingUrlsFromSearchHtml,
  fetchSearchListingUrls,
  processListingUrls
} from './lib/process-listings.mjs';
import { mapProcessedResults } from './lib/map-to-house.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

function parseArgs(argv) {
  const args = {
    city: 'sfbay',
    category: 'apa',
    displayState: 'California',
    postal: '',
    searchDistance: 25,
    max: 50,
    htmlFile: '',
    urlsFile: '',
    url: '',
    urls: [],
    detailHtmlDir: '',
    imagesDir: path.join(root, 'data', 'craigslist', 'images'),
    proxy: process.env.CRAIGSLIST_PROXY || '',
    useBrowser: true,
    headless: true,
    exportUrlsOnly: false,
    output: ''
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case '--city': args.city = next; i += 1; break;
      case '--category': args.category = next; i += 1; break;
      case '--state': args.displayState = next; i += 1; break;
      case '--postal': args.postal = next; i += 1; break;
      case '--distance': args.searchDistance = Number.parseInt(next, 10); i += 1; break;
      case '--max': args.max = Number.parseInt(next, 10); i += 1; break;
      case '--output': args.output = next; i += 1; break;
      case '--html-file': args.htmlFile = next; i += 1; break;
      case '--urls-file': args.urlsFile = next; i += 1; break;
      case '--url':
      case '--urls':
        if (next?.includes(',')) args.urls.push(...next.split(',').map((item) => item.trim()).filter(Boolean));
        else args.urls.push(next);
        i += 1;
        break;
      case '--detail-html-dir': args.detailHtmlDir = next; i += 1; break;
      case '--images-dir': args.imagesDir = next; i += 1; break;
      case '--proxy': args.proxy = next; i += 1; break;
      case '--browser': args.useBrowser = true; break;
      case '--no-browser': args.useBrowser = false; break;
      case '--headed': args.headless = false; break;
      case '--export-urls-only': args.exportUrlsOnly = true; break;
      case '--help':
        printHelp();
        process.exit(0);
        break;
      default:
        break;
    }
  }

  if (!args.output) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    args.output = path.join(root, 'data', 'craigslist', `${args.city}-${args.category}-${stamp}.json`);
  } else if (!path.isAbsolute(args.output)) {
    args.output = path.resolve(process.cwd(), args.output);
  }

  if (args.imagesDir && !path.isAbsolute(args.imagesDir)) {
    args.imagesDir = path.resolve(process.cwd(), args.imagesDir);
  }
  if (args.detailHtmlDir && !path.isAbsolute(args.detailHtmlDir)) {
    args.detailHtmlDir = path.resolve(process.cwd(), args.detailHtmlDir);
  }
  if (args.urlsFile && !path.isAbsolute(args.urlsFile)) {
    args.urlsFile = path.resolve(process.cwd(), args.urlsFile);
  }
  if (args.htmlFile && !path.isAbsolute(args.htmlFile)) {
    args.htmlFile = path.resolve(process.cwd(), args.htmlFile);
  }

  return args;
}

function resolveHtmlFile(inputPath) {
  const candidates = [
    inputPath,
    path.join(root, 'data', 'craigslist', path.basename(inputPath))
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`HTML file not found: ${inputPath}`);
}

async function loadUrls(args) {
  if (args.urls.length) return args.urls;
  if (args.url) return [args.url];
  if (args.urlsFile) {
    return fs.readFileSync(args.urlsFile, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
  }
  if (args.htmlFile) {
    const html = fs.readFileSync(resolveHtmlFile(args.htmlFile), 'utf8');
    return extractListingUrlsFromSearchHtml(html);
  }
  if (!args.postal) {
    throw new Error('Live search mode requires --postal. To scrape specific listings, pass --url or --urls instead.');
  }

  return fetchSearchListingUrls({
    city: args.city,
    category: args.category,
    postal: args.postal,
    searchDistance: args.searchDistance,
    hasPic: true,
    sort: 'date'
  }, {
    useBrowser: args.useBrowser,
    proxy: args.proxy,
    headless: args.headless
  });
}

function printHelp() {
  console.log(`Usage: node scripts/craigslist/scrape.mjs [options]

Automated mode (default, uses Playwright browser):
  node scripts/craigslist/scrape.mjs \\
    --city sfbay --state California --postal 94102 --max 50

Single listing by URL (no --postal needed):
  node scripts/craigslist/scrape.mjs \\
    --city sfbay --state California --max 1 \\
    --url "https://www.craigslist.org/view/d/.../7943706730"

All US states batch:
  node scripts/craigslist/batch-us.mjs --per-region-max 30

Options:
  --city --state --postal --distance 25   Live search + auto detail scrape
  --url URL / --urls URL                    Scrape specific listing(s), skip search
  --max 50
  --browser (default) / --no-browser
  --headed                                Show browser window
  --proxy URL                             Or env CRAIGSLIST_PROXY

Offline fallback:
  --html-file search.html --detail-html-dir details/
`);
}

async function main() {
  const args = parseArgs(process.argv);
  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.mkdirSync(args.imagesDir, { recursive: true });

  if (!args.proxy && args.useBrowser) {
    console.warn('Tip: set CRAIGSLIST_PROXY to a US residential proxy if Craigslist blocks your IP.');
  }

  try {
    const urls = await loadUrls(args);
    console.log(`Found ${urls.length} listing URLs`);

    if (args.exportUrlsOnly) {
      fs.writeFileSync(args.output, `${urls.join('\n')}\n`, 'utf8');
      console.log(`Exported URLs to ${args.output}`);
      return;
    }

    const { results, stats } = await processListingUrls(urls, {
      displayState: args.displayState
    }, {
      max: args.max,
      progressLabel: `${args.city}-${args.category}`,
      proxy: args.proxy,
      useBrowser: args.useBrowser,
      headless: args.headless,
      detailHtmlDir: args.detailHtmlDir,
      imagesDir: args.imagesDir,
      delayMs: 2000
    });

    const output = {
      meta: {
        city: args.city,
        category: args.category,
        postal: args.postal || null,
        scraped_at: new Date().toISOString(),
        mode: args.useBrowser ? 'browser' : 'http',
        input_urls: urls.length,
        kept: stats.kept,
        skipped_no_images: stats.skipped_no_images,
        skipped_errors: stats.skipped_errors,
        images_dir: args.imagesDir
      },
      listings: mapProcessedResults(results)
    };

    fs.writeFileSync(args.output, JSON.stringify(output, null, 2), 'utf8');
    console.log(`Saved ${stats.kept} listings to ${args.output}`);
    console.log(`Skipped: no_images=${stats.skipped_no_images}, errors=${stats.skipped_errors}`);
  } finally {
    if (args.useBrowser) await closeBrowser();
  }
}

main().catch(async (error) => {
  await closeBrowser();
  const ctx = {
    city: process.argv.includes('--city') ? process.argv[process.argv.indexOf('--city') + 1] : 'sfbay',
    category: process.argv.includes('--category') ? process.argv[process.argv.indexOf('--category') + 1] : 'apa',
    displayState: process.argv.includes('--state') ? process.argv[process.argv.indexOf('--state') + 1] : 'California',
    postal: process.argv.includes('--postal') ? process.argv[process.argv.indexOf('--postal') + 1] : '94102',
    max: process.argv.includes('--max') ? process.argv[process.argv.indexOf('--max') + 1] : '50'
  };
  if (error.blocked) {
    console.error(blockedHelp(ctx));
  } else if (/timeout|ERR_TIMED_OUT|ETIMEDOUT/i.test(String(error.message || error))) {
    const { timeoutHelp } = await import('./lib/http.mjs');
    console.error(timeoutHelp(ctx));
  }
  console.error(error.message || error);
  process.exit(1);
});
