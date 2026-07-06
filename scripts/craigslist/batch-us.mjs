#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeBrowser } from './lib/browser.mjs';
import { fetchSearchListingUrls, processListingUrls } from './lib/process-listings.mjs';
import { mapProcessedResults } from './lib/map-to-house.mjs';
import {
  dedupeListingResults,
  loadSeenKeysFromBatchDir,
  loadSeenKeysFromListings,
  rememberListingKeys
} from './lib/listing-key.mjs';
import { createBatchProgress, createStepProgress } from './lib/progress.mjs';
import { readJsonFile, writeJsonFileAtomic, quarantineCorruptFile } from './lib/safe-json.mjs';

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
    mergeOnly: false,
    concurrency: 2,
    delayMs: 1200,
    maxRetries: 3,
    blockWaitMs: 90000
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
      case '--concurrency': args.concurrency = Number.parseInt(next, 10); i += 1; break;
      case '--delay-ms': args.delayMs = Number.parseInt(next, 10); i += 1; break;
      case '--max-retries': args.maxRetries = Number.parseInt(next, 10); i += 1; break;
      case '--block-wait-ms': args.blockWaitMs = Number.parseInt(next, 10); i += 1; break;
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
  --per-region-max 30     Max detail pages per metro (0 = all found URLs)
  --distance 25           Search radius miles
  --output-dir DIR        JSON output per region + merged all-us.json
  --proxy URL             US proxy (or set CRAIGSLIST_PROXY)
  --headed                Show browser window
  --no-resume             Ignore saved region JSON and re-scrape from scratch
  --merge-only            Rebuild all-us.json from existing region JSON files (deduped by URL/cdkey)
  --concurrency 2         Parallel detail pages per region (default: 2, use 1 if blocked often)
  --delay-ms 1200         Delay between starting each listing worker (default: 1200)
  --max-retries 3         Retries per listing when blocked (default: 3)
  --block-wait-ms 90000   Pause and reset browser after N consecutive blocks (default: 90s)

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

  const rawListings = [];
  const regionKeys = [];
  const mergeProgress = createStepProgress({ label: 'Merge', total: files.length });

  for (const file of files) {
    const payload = JSON.parse(fs.readFileSync(path.join(outputDir, file), 'utf8'));
    regionKeys.push(file.replace(/\.json$/, ''));
    rawListings.push(...(payload.listings || []));
    mergeProgress.tick(1, file);
  }

  const listings = dedupeListingResults(rawListings);
  mergeProgress.done(`${listings.length} unique listings`);
  const mergedFile = path.join(outputDir, 'all-us.json');
  writeJsonFileAtomic(mergedFile, {
    meta: {
      scraped_at: new Date().toISOString(),
      regions_on_disk: regionKeys.length,
      regions_requested: selectedCount,
      region_files: regionKeys,
      total_listings: listings.length,
      total_before_dedup: rawListings.length,
      duplicates_removed: rawListings.length - listings.length
    },
    listings
  });

  return { mergedFile, total: listings.length, regionKeys, duplicatesRemoved: rawListings.length - listings.length };
}

function buildRegionPayload(region, meta, listings) {
  return {
    meta: {
      region: region.label,
      state: region.state,
      abbr: region.abbr,
      city: region.city,
      postal: region.postal,
      scraped_at: new Date().toISOString(),
      ...meta
    },
    listings: dedupeListingResults(listings)
  };
}

function saveRegionFile(outFile, region, meta, listings) {
  writeJsonFileAtomic(outFile, buildRegionPayload(region, meta, listings));
}

function loadRegionFile(outFile, key) {
  try {
    return readJsonFile(outFile);
  } catch (error) {
    const quarantined = quarantineCorruptFile(outFile);
    console.warn(
      `[${key}] Region JSON corrupt (${error.message}). ` +
      (quarantined ? `Quarantined -> ${quarantined}. ` : '') +
      'Starting this region from scratch; re-run --merge-only after recovery.'
    );
    return null;
  }
}

async function scrapeRegion(region, args, globalSeenKeys, batchProgress, regionIndex) {
  const key = regionKey(region);
  const outFile = path.join(args.outputDir, `${key}.json`);

  batchProgress.regionStart(regionIndex, region);

  let existingListings = [];
  if (args.resume && fs.existsSync(outFile)) {
    const existing = loadRegionFile(outFile, key);
    if (existing) {
      existingListings = existing.listings || [];
      for (const listingKey of loadSeenKeysFromListings(existingListings)) {
        globalSeenKeys.add(listingKey);
    
      console.log(`Resume ${key}: ${existingListings.length} listings already saved`);
    }
  } else if (!args.resume && fs.existsSync(outFile)) {
    const existing = loadRegionFile(outFile, key);
    if (existing) {
      for (const listingKey of loadSeenKeysFromListings(existing.listings)) {
        globalSeenKeys.delete(listingKey);
      }
      console.log(`Re-scrape ${key}: ignoring ${(existing.listings || []).length} previously saved listings`);
    }
  }

  console.log(`Fetching search URLs for ${key}...`);

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

  const existingCount = existingListings.length;
  const remaining = args.perRegionMax > 0
    ? Math.max(0, args.perRegionMax - existingCount)
    : urls.length;

  if (args.perRegionMax > 0 && existingCount >= args.perRegionMax) {
    console.log(`Region already has ${existingCount} listings (limit ${args.perRegionMax}), skipping scrape`);
    batchProgress.regionDone({
      totalListings: existingCount,
      newListings: 0
    });
    return buildRegionPayload(region, {
      input_urls: urls.length,
      existing_listings: existingCount,
      kept: 0,
      skipped_already: urls.length,
      process_limit: 0
    }, existingListings);
  }

  const processMax = args.perRegionMax > 0 ? remaining : urls.length;
  if (args.perRegionMax > 0) {
    console.log(`Processing up to ${processMax} new URLs (${existingCount} already saved, limit ${args.perRegionMax})`);
  } else {
    console.log(`Processing up to ${processMax} new listing URLs`);
  }

  let listings = [...existingListings];

  const { results, stats } = await processListingUrls(urls, {
    displayState: region.state
  }, {
    max: processMax,
    seenKeys: globalSeenKeys,
    progressLabel: key,
    concurrency: args.concurrency,
    maxRetries: args.maxRetries,
    blockWaitMs: args.blockWaitMs,
    proxy: args.proxy,
    useBrowser: true,
    headless: args.headless,
    imagesDir: args.imagesDir,
    delayMs: args.delayMs,
    onKept: (result) => {
      listings = dedupeListingResults([...listings, ...mapProcessedResults([result])]);
      saveRegionFile(outFile, region, {
        input_urls: urls.length,
        existing_listings: existingCount,
        process_limit: processMax,
        kept: listings.length - existingCount,
        total_listings: listings.length,
        in_progress: true
      }, listings);
    }
  });

  listings = dedupeListingResults([
    ...existingListings,
    ...mapProcessedResults(results)
  ]);

  const meta = {
    input_urls: urls.length,
    existing_listings: existingCount,
    process_limit: processMax,
    kept: listings.length - existingCount,
    total_listings: listings.length,
    skipped_already: stats.skipped_already,
    skipped_no_images: stats.skipped_no_images,
    skipped_errors: stats.skipped_errors,
    processed: stats.processed
  };

  saveRegionFile(outFile, region, meta, listings);

  batchProgress.regionDone({
    totalListings: listings.length,
    newListings: meta.kept
  });

  console.log(
    `Saved ${outFile} | total=${listings.length}, new=${meta.kept}, skipped already=${stats.skipped_already}`
  );

  if (stats.skipped_errors > 0 && stats.skipped_errors >= stats.kept) {
    console.warn(
      `[${key}] High block/error rate (${stats.skipped_errors} errors vs ${stats.kept} kept). ` +
      'Try: --concurrency 1 --delay-ms 2000 and set CRAIGSLIST_PROXY to a US residential proxy, then re-run (resume skips done URLs).'
    );
  }

  return buildRegionPayload(region, meta, listings);
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.mergeOnly) {
    const { mergedFile, total, regionKeys, duplicatesRemoved } = rebuildMergedFile(args.outputDir);
    const dedupNote = duplicatesRemoved > 0 ? `, removed ${duplicatesRemoved} duplicates` : '';
    console.log(`Merged ${total} listings from ${regionKeys.length} region files${dedupNote} -> ${mergedFile}`);
    return;
  }

  const selected = filterRegions(args);
  fs.mkdirSync(args.outputDir, { recursive: true });
  fs.mkdirSync(args.imagesDir, { recursive: true });

  const globalSeenKeys = loadSeenKeysFromBatchDir(args.outputDir);
  const batchProgress = createBatchProgress(selected.length);

  console.log(`\n${'='.repeat(64)}`);
  console.log(`Craigslist US batch scrape`);
  console.log(`Regions: ${selected.length} | per-region-max: ${args.perRegionMax || 'unlimited'} | concurrency: ${args.concurrency} | resume: ${args.resume}`);
  if (globalSeenKeys.size > 0) {
    console.log(`Known listings from disk: ${globalSeenKeys.size}`);
  }
  console.log(`${'='.repeat(64)}`);

  if (!args.proxy) {
    console.warn('No CRAIGSLIST_PROXY set. From outside the US you usually need a US residential proxy.');
  }

  const merged = [];

  try {
    for (let i = 0; i < selected.length; i += 1) {
      const region = selected[i];
      try {
        const payload = await scrapeRegion(region, args, globalSeenKeys, batchProgress, i);
        merged.push(...payload.listings);
      } catch (error) {
        console.error(`Region failed ${region.label}: ${error.message}`);
        batchProgress.regionDone({ failed: true });
      }
    }
  } finally {
    await closeBrowser();
  }

  const mergedFile = path.join(args.outputDir, 'all-us.json');
  const rebuilt = rebuildMergedFile(args.outputDir, selected.length);
  const dedupNote = rebuilt.duplicatesRemoved > 0 ? `, removed ${rebuilt.duplicatesRemoved} duplicates` : '';
  batchProgress.printSummary(`Merged ${rebuilt.total} listings -> ${mergedFile}${dedupNote}`);
  if (merged.length !== rebuilt.total) {
    console.warn(`Note: ${selected.length - rebuilt.regionKeys.length} requested regions have no saved JSON yet (network timeout or not scraped).`);
  }
}

main().catch(async (error) => {
  await closeBrowser();
  console.error(error.message || error);
  process.exit(1);
});
