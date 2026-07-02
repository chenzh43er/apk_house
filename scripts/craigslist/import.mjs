#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { createStepProgress } from './lib/progress.mjs';

const { Client } = pg;

const HOUSE_COLUMNS = [
  'id', 'name', 'location', 'mainpic', 'msg', 'tel', 'status', 'pics',
  'detail_loca1', 'detail_loca2', 'detail_loca3', 'room', 'area', 'loft',
  'supplier', 'price', 'ver', 'info', 'statetype', 'street', 'district',
  'city', 'state', 'country', 'county', 'display_name', 'address_json',
  'display_state', 'display_city', 'display_district', 'pic_count',
  'pics_jsonStr', 'cdkey', 'create_time', 'update_time'
];

function parseArgs(argv) {
  const args = {
    input: '',
    dryRun: false,
    upsert: false,
    databaseUrl: process.env.DATABASE_URL || ''
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case '--input': args.input = next; i += 1; break;
      case '--database-url': args.databaseUrl = next; i += 1; break;
      case '--dry-run': args.dryRun = true; break;
      case '--upsert': args.upsert = true; break;
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

  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/craigslist/import.mjs --input data/craigslist/file.json [options]

Options:
  --input file.json        Scraped JSON from scrape.mjs
  --database-url URL         PostgreSQL URL (default: DATABASE_URL env)
  --dry-run                  Validate only, do not insert
  --upsert                   Update existing rows with the same cdkey

Dedup key:
  cdkey = cl-{craigslist_posting_id}
  Same posting is skipped by default; use --upsert to refresh fields.

Environment:
  DATABASE_URL               e.g. from secrets/us-database.env

Example:
  set DATABASE_URL=postgresql://...
  node scripts/craigslist/import.mjs --input data/craigslist/sfbay-apa-....json
`);
}

function loadDatabaseUrl(explicit) {
  if (explicit) return explicit;

  const envPath = path.resolve('secrets/us-database.env');
  if (fs.existsSync(envPath)) {
    const line = fs.readFileSync(envPath, 'utf8')
      .split('\n')
      .find((row) => row.startsWith('DATABASE_URL='));
    if (line) return line.slice('DATABASE_URL='.length).trim();
  }

  throw new Error('DATABASE_URL not set. Pass --database-url or create secrets/us-database.env');
}

const VARCHAR_LIMITS = {
  id: 255,
  name: 255,
  location: 255,
  mainpic: 255,
  tel: 255,
  pics: 1000,
  detail_loca1: 255,
  detail_loca2: 255,
  detail_loca3: 255,
  room: 255,
  area: 255,
  loft: 255,
  supplier: 1000,
  price: 255,
  ver: 255,
  statetype: 255,
  street: 255,
  district: 255,
  city: 255,
  state: 255,
  country: 255,
  county: 255,
  display_name: 255,
  address_json: 1000,
  display_state: 255,
  display_city: 255,
  display_district: 255,
  pics_jsonStr: 1000,
  cdkey: 255,
  create_time: 50,
  update_time: 50
};

function truncateText(value, maxLen) {
  const text = value == null ? '' : String(value);
  if (!maxLen || text.length <= maxLen) return text;
  return text.slice(0, Math.max(0, maxLen - 1)).trimEnd();
}

function trimPicsJson(value, maxLen = 1000) {
  const text = value == null ? '[]' : String(value);
  if (text.length <= maxLen) return text;

  let pics;
  try {
    pics = JSON.parse(text);
  } catch {
    return truncateText(text, maxLen);
  }

  if (!Array.isArray(pics)) return truncateText(text, maxLen);

  const trimmed = [...pics];
  while (trimmed.length > 0 && JSON.stringify(trimmed).length > maxLen) {
    trimmed.pop();
  }

  return JSON.stringify(trimmed);
}

function sanitizeRow(row) {
  const copy = { ...row };
  const picsJson = trimPicsJson(copy.pics_jsonStr ?? copy.pics, VARCHAR_LIMITS.pics_jsonStr);
  copy.pics_jsonStr = picsJson;
  copy.pics = picsJson;

  let picCount = copy.pic_count;
  try {
    picCount = JSON.parse(picsJson).length;
  } catch {
    picCount = copy.pic_count ?? 0;
  }
  copy.pic_count = picCount;

  for (const [column, maxLen] of Object.entries(VARCHAR_LIMITS)) {
    if (column === 'pics' || column === 'pics_jsonStr') continue;
    if (copy[column] != null) {
      copy[column] = truncateText(copy[column], maxLen);
    }
  }

  return copy;
}

function stripMetaFields(row) {
  const copy = { ...row };
  delete copy._source;
  return sanitizeRow(copy);
}

function dedupeRows(rows) {
  const seen = new Set();
  const unique = [];

  for (const row of rows) {
    const key = row.cdkey;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }

  return unique;
}

function buildUpdateAssignments() {
  return HOUSE_COLUMNS
    .filter((column) => !['id', 'create_time', 'cdkey'].includes(column))
    .map((column, index) => `"${column}" = $${index + 2}`)
    .join(', ');
}

function buildUpdateValues(row) {
  return HOUSE_COLUMNS
    .filter((column) => !['id', 'create_time', 'cdkey'].includes(column))
    .map((column) => row[column] ?? null);
}

async function main() {
  const args = parseArgs(process.argv);
  const databaseUrl = loadDatabaseUrl(args.databaseUrl);
  const payload = JSON.parse(fs.readFileSync(args.input, 'utf8'));
  const rawRows = (payload.listings || []).map((item) => stripMetaFields(item.house_ger));
  const rows = dedupeRows(rawRows);

  if (!rows.length) {
    console.log('No listings found in input file.');
    return;
  }

  console.log(`Loaded ${rows.length} rows from ${args.input}${rawRows.length !== rows.length ? ` (${rawRows.length - rows.length} duplicate cdkey in file removed)` : ''}`);

  if (args.dryRun) {
    console.log('Dry run OK. Sample row:');
    console.log(JSON.stringify(rows[0], null, 2));
    return;
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  let inserted = 0;
  let skipped = 0;
  let updated = 0;

  const progress = createStepProgress({ label: 'Import', total: rows.length });
  progress.start();

  try {
    for (const row of rows) {
      const values = HOUSE_COLUMNS.map((column) => row[column] ?? null);
      const quotedColumns = HOUSE_COLUMNS.map((column) => `"${column}"`).join(', ');
      const placeholders = HOUSE_COLUMNS.map((_, index) => `$${index + 1}`).join(', ');

      const existing = await client.query(
        'SELECT id FROM house_ger WHERE cdkey = $1 LIMIT 1',
        [row.cdkey]
      );

      if (existing.rowCount > 0) {
        if (args.upsert) {
          const sql = `UPDATE house_ger SET ${buildUpdateAssignments()} WHERE cdkey = $1`;
          await client.query(sql, [row.cdkey, ...buildUpdateValues(row)]);
          updated += 1;
          progress.tick(1, `updated ${row.cdkey}`);
        } else {
          skipped += 1;
          progress.tick(1, `skipped ${row.cdkey}`);
        }
        continue;
      }

      const sql = `INSERT INTO house_ger (${quotedColumns}) VALUES (${placeholders})`;
      await client.query(sql, values);
      inserted += 1;
      progress.tick(1, `inserted ${row.cdkey}`);
    }
  } finally {
    await client.end();
  }

  progress.done(`inserted=${inserted}, updated=${updated}, skipped=${skipped}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
