#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const DEFAULT_ACCOUNT_ID = '0e70af17109f26d0d034bab33006f59e';
const DEFAULT_BUCKET = 'houseus';
const DEFAULT_CDN_BASE = 'https://main.apk-house.pages.dev/cdn/us';

function parseArgs(argv) {
  const args = {
    input: '',
    imagesDir: path.join(root, 'data', 'craigslist', 'images'),
    bucket: DEFAULT_BUCKET,
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID || DEFAULT_ACCOUNT_ID,
    cdnBase: process.env.CRAIGSLIST_CDN_BASE || DEFAULT_CDN_BASE,
    dryRun: false,
    skipExisting: true,
    concurrency: 4
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case '--input': args.input = next; i += 1; break;
      case '--images-dir': args.imagesDir = next; i += 1; break;
      case '--bucket': args.bucket = next; i += 1; break;
      case '--account-id': args.accountId = next; i += 1; break;
      case '--concurrency': args.concurrency = Number.parseInt(next, 10); i += 1; break;
      case '--cdn-base': args.cdnBase = next; i += 1; break;
      case '--dry-run': args.dryRun = true; break;
      case '--skip-existing': args.skipExisting = true; break;
      case '--force': args.skipExisting = false; break;
      case '--help':
        printHelp();
        process.exit(0);
        break;
      default:
        break;
    }
  }

  if (!args.input) {
    throw new Error('Missing --input path to scraped JSON file');
  }

  if (!path.isAbsolute(args.input)) {
    args.input = path.resolve(process.cwd(), args.input);
  }
  if (!path.isAbsolute(args.imagesDir)) {
    args.imagesDir = path.resolve(process.cwd(), args.imagesDir);
  }

  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/craigslist/upload-images.mjs --input data/craigslist/file.json [options]

Upload scraped listing images to Cloudflare R2 (houseus bucket).
R2 key format: {mainpic}/{filename}.jpg
CDN path: /cdn/us/{mainpic}/{filename}.jpg

Options:
  --input file.json       Scraped JSON from scrape.mjs
  --images-dir DIR        Local images root (default: data/craigslist/images)
  --bucket NAME           R2 bucket (default: houseus)
  --account-id ID         Cloudflare account (default: Chjgf account)
  --concurrency N         Parallel uploads (default: 4)
  --dry-run               Print planned uploads only
  --skip-existing         Skip images already on CDN (default)
  --force                 Re-upload even if CDN already has the file

Dedup key:
  R2 object key = {mainpic}/{filename}
  Same key is skipped by default via CDN HEAD check.

Environment:
  CRAIGSLIST_CDN_BASE     CDN prefix used for skip check (default: pages.dev /cdn/us)
  CLOUDFLARE_ACCOUNT_ID   Overrides default account id

Example:
  node scripts/craigslist/upload-images.mjs --input data/craigslist/sfbay-apa-....json
`);
}

function contentTypeFor(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

function collectUploadJobs(payload, imagesDir) {
  const listings = payload.listings || [];
  const seen = new Set();
  const jobs = [];

  for (const item of listings) {
    const house = item.house_ger || item;
    const mainpic = house.mainpic;
    if (!mainpic) continue;

    let files = [];
    try {
      files = JSON.parse(house.pics_jsonStr || house.pics || '[]');
    } catch {
      files = [];
    }

    for (const fileName of files) {
      if (!fileName) continue;
      const key = `${mainpic}/${fileName}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const localPath = path.join(imagesDir, mainpic, fileName);
      jobs.push({
        mainpic,
        fileName,
        key,
        localPath,
        objectPath: `${DEFAULT_BUCKET}/${key}`
      });
    }
  }

  return jobs;
}

function runWrangler(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['wrangler', ...args], {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || stdout.trim() || `wrangler exited ${code}`));
    });
  });
}

async function objectExistsOnCdn(key, cdnBase) {
  const base = String(cdnBase || DEFAULT_CDN_BASE).replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/${key}`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(10000)
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function uploadOne(job, options) {
  const env = { CLOUDFLARE_ACCOUNT_ID: options.accountId };
  const bucket = options.bucket;

  if (!fs.existsSync(job.localPath)) {
    return { status: 'missing', job };
  }

  if (options.skipExisting) {
    const exists = await objectExistsOnCdn(job.key, options.cdnBase);
    if (exists) return { status: 'skipped', job };
  }

  if (options.dryRun) {
    return { status: 'planned', job };
  }

  await runWrangler([
    'r2', 'object', 'put', `${bucket}/${job.key}`,
    '--file', job.localPath,
    '--content-type', contentTypeFor(job.fileName),
    '--remote'
  ], env);

  return { status: 'uploaded', job };
}

async function runPool(jobs, options) {
  const stats = { uploaded: 0, skipped: 0, missing: 0, failed: 0, planned: 0 };
  let index = 0;

  async function worker() {
    while (index < jobs.length) {
      const current = jobs[index];
      index += 1;
      try {
        const result = await uploadOne(current, options);
        stats[result.status] += 1;
        if (result.status === 'uploaded') {
          console.log(`uploaded ${current.key}`);
        } else if (result.status === 'skipped') {
          // quiet by default
        } else if (result.status === 'missing') {
          console.warn(`missing local file: ${current.localPath}`);
        }
      } catch (error) {
        stats.failed += 1;
        console.warn(`failed ${current.key}: ${error.message}`);
      }
    }
  }

  const workers = Array.from({ length: Math.max(1, options.concurrency) }, () => worker());
  await Promise.all(workers);
  return stats;
}

async function main() {
  const args = parseArgs(process.argv);
  const payload = JSON.parse(fs.readFileSync(args.input, 'utf8'));
  const jobs = collectUploadJobs(payload, args.imagesDir);

  if (!jobs.length) {
    console.log('No images found in input file.');
    return;
  }

  console.log(`Prepared ${jobs.length} image uploads to ${args.bucket}`);
  if (args.dryRun) {
    for (const job of jobs.slice(0, 10)) {
      console.log(`[dry-run] ${job.localPath} -> ${args.bucket}/${job.key}`);
    }
    if (jobs.length > 10) console.log(`... and ${jobs.length - 10} more`);
    return;
  }

  const stats = await runPool(jobs, args);
  console.log(`Upload complete: uploaded=${stats.uploaded}, skipped=${stats.skipped}, missing=${stats.missing}, failed=${stats.failed}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
