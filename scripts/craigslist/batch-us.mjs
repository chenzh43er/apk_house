#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeBrowser } from './lib/browser.mjs';
import { fetchSearchListingUrls, processListingUrls } from './lib/process-listings.mjs';
import { mapProcessedResults } from './lib/map-to-house.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const regions = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/us-regions.json'), 'utf8'));

function parseArgs(argv) {
  const args = {
    states: '',
    perRegionMax: 30,
    distance: 25,
    category: 'apa',
    outputDir: path.join(root, 'data', 'craigslist', 'batch'),
    imagesDir: path.join(root, 'data', 'craigslist', 'images'),
    proxy: process.env.CRAIGSLIST_PROXY || '',
    headless: true,
    resume: true,
    mergeOnly: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case '--states': args.states = next; i += 1; break;
      case '--per-region-max': args.perRegionMax = Number.parseInt(next, 10); i += 1; break;
      case '--distance': args.distance = Number.parseInt(next, 10); i += 1; break;
      case '--output-dir': args.outputDir = next; i += 1; break;
      case '--images-dir': args.imagesDir = next; i += 1; break;
      case '--proxy': args.proxy = next; i += 1; break;
      case '--headed': args.headless = false; break;
      case '--no-resume': args.resume = false; break;
      case '--merge-only': args.mergeOnly = true; break;
      case '--help':
        printHelp();
        process.exit(0);
        break;
      default:
        break;
    }
  }

  if (!path.isAbsolute(args.outputDir)) args.outputDir = path.resolve(process.cwd(), args.outputDir);
  if (!path.isAbsolute(args.imagesDir)) args.imagesDir = path.resolve(process.cwd(), args.imagesDir);
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/craigslist/batch-us.mjs [options]

Fully automated US Craigslist housing scrape (Playwright browser).

Options:
  --states CA,NY,TX       Only these states (abbr or name). Default: all regions
  --per-region-max 30     Max listings per metro area
  --distance 25           Search radius miles
  --output-dir DIR        JSON output per region + merged all-us.json
  --proxy URL             US proxy (or set CRAIGSLIST_PROXY)
  --headed                Show browser window
  --no-resume             Re-scrape regions already completed
  --merge-only            Rebuild all-us.json from existing region JSON files

Examples:
  node scripts/craigslist/batch-us.mjs --states CA --per-region-max 20 --headed
  node scripts/craigslist/batch-us.mjs --merge-only
  set CRAIGSLIST_PROXY=http://user:pass@host:port
  node scripts/craigslist/batch-us.mjs --per-region-max 50
`);
}

function filterRegions(args) {
  if (!args.states) return regions;
  const wanted = new Set(args.states.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
  return regions.filter((r) => wanted.has(r.abbr.toLowerCase()) || wanted.has(r.state.toLowerCase()));
}

function regionKey(region) {
  return `${region.abbr}-${region.city}`;
}

function isRegionFile(name) {
  return /^[A-Z]{2}-.+\.json$/i.test(name) && name !== 'all-us.json';
}

function rebuildMergedFile(outputDir, selectedCount = null) {
  const files = fs.readdirSync(outputDir)
    .filter(isRegionFile)
    .sort();

  const listings = [];
  const regionKeys = [];

  for (const file of files) {
    const payload = JSON.parse(fs.readFileSync(path.join(outputDir, file), 'utf8'));
    regionKeys.push(file.replace(/\.json$/, ''));
    listings.push(...(payload.listings || []));
  }

  const mergedFile = path.join(outputDir, 'all-us.json');
  fs.writeFileSync(mergedFile, JSON.stringify({
    meta: {
      scraped_at: new Date().toISOString(),
      regions_on_disk: regionKeys.length,
      regions_requested: selectedCount,
      region_files: regionKeys,
      total_listings: listings.length
    },
    listings
  }, null, 2), 'utf8');

  return { mergedFile, total: listings.length, regionKeys };
}

async function scrapeRegion(region, args) {
  const key = regionKey(region);
  const outFile = path.join(args.outputDir, `${key}.json`);
  if (args.resume && fs.existsSync(outFile)) {
    console.log(`Skip completed region ${key}`);
    return JSON.parse(fs.readFileSync(outFile, 'utf8'));
  }

  console.log(`\n=== ${region.label} (${region.state}) ===`);

  const urls = await fetchSearchListingUrls({
    city: region.city,
    category: args.category,
    postal: region.postal,
    searchDistance: args.distance,
    hasPic: true,
    sort: 'date'
  }, {
    useBrowser: true,
    proxy: args.proxy,
    headless: args.headless
  });

  console.log(`Found ${urls.length} listing URLs`);

  const { results, stats } = await processListingUrls(urls, {
    displayState: region.state
  }, {
    max: args.perRegionMax,
    proxy: args.proxy,
    useBrowser: true,
    headless: args.headless,
    imagesDir: args.imagesDir,
    delayMs: 2000
  });

  const payload = {
    meta: {
      region: region.label,
      state: region.state,
      abbr: region.abbr,
      city: region.city,
      postal: region.postal,
      scraped_at: new Date().toISOString(),
      input_urls: urls.length,
      kept: stats.kept,
      skipped_no_images: stats.skipped_no_images,
      skipped_errors: stats.skipped_errors
    },
    listings: mapProcessedResults(results)
  };

  fs.mkdirSync(args.outputDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`Saved ${stats.kept} listings -> ${outFile}`);
  return payload;
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.mergeOnly) {
    const { mergedFile, total, regionKeys } = rebuildMergedFile(args.outputDir);
    console.log(`Merged ${total} listings from ${regionKeys.length} region files -> ${mergedFile}`);
    return;
  }

  const selected = filterRegions(args);
  fs.mkdirSync(args.outputDir, { recursive: true });
  fs.mkdirSync(args.imagesDir, { recursive: true });

  console.log(`Regions to scrape: ${selected.length}`);
  if (!args.proxy) {
    console.warn('No CRAIGSLIST_PROXY set. From outside the US you usually need a US residential proxy.');
  }

  const merged = [];

  try {
    for (const region of selected) {
      try {
        const payload = await scrapeRegion(region, args);
        merged.push(...payload.listings);
      } catch (error) {
        console.error(`Region failed ${region.label}: ${error.message}`);
      }
    }
  } finally {
    await closeBrowser();
  }

  const mergedFile = path.join(args.outputDir, 'all-us.json');
  const rebuilt = rebuildMergedFile(args.outputDir, selected.length);
  console.log(`\nMerged ${rebuilt.total} listings from ${rebuilt.regionKeys.length} region files -> ${mergedFile}`);
  if (merged.length !== rebuilt.total) {
    console.warn(`Note: ${selected.length - rebuilt.regionKeys.length} requested regions have no saved JSON yet (network timeout or not scraped).`);
  }
}

main().catch(async (error) => {
  await closeBrowser();
  console.error(error.message || error);
  process.exit(1);
});
