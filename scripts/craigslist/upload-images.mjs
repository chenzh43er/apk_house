#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createStepProgress, shortText } from './lib/progress.mjs';
import { loadEnvFile } from './lib/load-env-file.mjs';
import { createR2Client, r2ObjectExists, r2PutObject } from './lib/r2-s3.mjs';

loadEnvFile('secrets/us-r2.env');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const DEFAULT_ACCOUNT_ID = '892acd09257ee1251aca55e5a6f9946e';
const DEFAULT_BUCKET = 'houseus';
const DEFAULT_CDN_BASE = 'https://main.apk-house.pages.dev/cdn/us';

function parseArgs(argv) {
  const args = {
    input: '',
    imagesDir: path.join(root, 'data', 'craigslist', 'images'),
    bucket: process.env.R2_BUCKET || DEFAULT_BUCKET,
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

Upload scraped listing images to Cloudflare R2 (Ubeator account, houseus bucket).
R2 key format: {mainpic}/{filename}.jpg
CDN path: /cdn/us/{mainpic}/{filename}.jpg

Options:
  --input file.json       Scraped JSON from scrape.mjs / batch-us.mjs
  --images-dir DIR        Local images root (default: data/craigslist/images)
  --bucket NAME           R2 bucket (default: houseus)
  --account-id ID         Cloudflare account (default: Ubeator 892acd09...)
  --concurrency N         Parallel uploads (default: 4)
  --dry-run               Print planned uploads only
  --skip-existing         Skip images already on CDN (default)
  --force                 Re-upload even if CDN already has the file

Credentials (auto-loaded from secrets/us-r2.env):
  R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_ENDPOINT   S3 upload (recommended)
  CLOUDFLARE_ACCOUNT_ID / R2_BUCKET / CRAIGSLIST_CDN_BASE
  CLOUDFLARE_API_TOKEN                                    wrangler fallback only

Example:
  node scripts/craigslist/upload-images.mjs --input data/craigslist/batch/all-us.json
`);
}

function contentTypeFor(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

function collectUploadJobs(payload, imagesDir, bucket) {
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
        objectPath: `${bucket}/${key}`
      });
    }
  }

  return jobs;
}

function hasR2S3Credentials() {
  return Boolean(
    process.env.R2_ENDPOINT
    && process.env.R2_ACCESS_KEY_ID
    && process.env.R2_SECRET_ACCESS_KEY
  );
}

function uploadEnv(options) {
  const env = {
    ...process.env,
    CLOUDFLARE_ACCOUNT_ID: options.accountId
  };

  if (process.env.CLOUDFLARE_API_TOKEN) {
    env.CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
  }

  return env;
}

function runWrangler(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['wrangler', ...args], {
      cwd: root,
      env,
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

async function uploadOne(job, options, r2Client) {
  const bucket = options.bucket;

  if (!fs.existsSync(job.localPath)) {
    return { status: 'missing', job };
  }

  if (options.skipExisting) {
    if (r2Client) {
      try {
        if (await r2ObjectExists(r2Client, bucket, job.key)) {
          return { status: 'skipped', job };
        }
      } catch {
        const exists = await objectExistsOnCdn(job.key, options.cdnBase);
        if (exists) return { status: 'skipped', job };
      }
    } else {
      const exists = await objectExistsOnCdn(job.key, options.cdnBase);
      if (exists) return { status: 'skipped', job };
    }
  }

  if (options.dryRun) {
    return { status: 'planned', job };
  }

  if (r2Client) {
    await r2PutObject(r2Client, bucket, job.key, job.localPath, contentTypeFor(job.fileName));
    return { status: 'uploaded', job };
  }

  await runWrangler([
    'r2', 'object', 'put', `${bucket}/${job.key}`,
    '--file', job.localPath,
    '--content-type', contentTypeFor(job.fileName),
    '--remote'
  ], uploadEnv(options));

  return { status: 'uploaded', job };
}

async function runPool(jobs, options, r2Client) {
  const stats = { uploaded: 0, skipped: 0, missing: 0, failed: 0, planned: 0 };
  let index = 0;
  const progress = createStepProgress({ label: 'Upload', total: jobs.length });
  progress.start(`concurrency=${options.concurrency}`);

  async function worker() {
    while (index < jobs.length) {
      const current = jobs[index];
      index += 1;
      try {
        const result = await uploadOne(current, options, r2Client);
        stats[result.status] += 1;
        progress.tick(1, `${result.status} ${shortText(current.key, 64)}`);
      } catch (error) {
        stats.failed += 1;
        progress.tick(1, `failed ${shortText(current.key, 48)} (${error.message})`);
      }
    }
  }

  const workers = Array.from({ length: Math.max(1, options.concurrency) }, () => worker());
  await Promise.all(workers);
  progress.done(`uploaded=${stats.uploaded}, skipped=${stats.skipped}, missing=${stats.missing}, failed=${stats.failed}`);
  return stats;
}

async function main() {
  const args = parseArgs(process.argv);

  if (!hasR2S3Credentials() && !process.env.CLOUDFLARE_API_TOKEN) {
    console.warn('No R2 credentials — copy secrets/us-r2.env.example to secrets/us-r2.env');
  }

  const r2Client = hasR2S3Credentials() ? createR2Client() : null;
  const payload = JSON.parse(fs.readFileSync(args.input, 'utf8'));
  const jobs = collectUploadJobs(payload, args.imagesDir, args.bucket);

  if (!jobs.length) {
    console.log('No images found in input file.');
    return;
  }

  console.log(
    `Prepared ${jobs.length} uploads -> account ${args.accountId}, bucket ${args.bucket}, ` +
    `mode ${r2Client ? 'S3 API' : 'wrangler'}, CDN ${args.cdnBase}`
  );

  if (args.dryRun) {
    for (const job of jobs.slice(0, 10)) {
      console.log(`[dry-run] ${job.localPath} -> ${args.bucket}/${job.key}`);
    }
    if (jobs.length > 10) console.log(`... and ${jobs.length - 10} more`);
    return;
  }

  const stats = await runPool(jobs, args, r2Client);
  console.log(`Upload summary: uploaded=${stats.uploaded}, skipped=${stats.skipped}, missing=${stats.missing}, failed=${stats.failed}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
