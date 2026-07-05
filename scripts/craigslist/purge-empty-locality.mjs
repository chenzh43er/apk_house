#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;

function parseArgs(argv) {
  const args = {
    dryRun: false,
    cdkeyPrefix: 'cl-',
    databaseUrl: process.env.DATABASE_URL || ''
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case '--dry-run': args.dryRun = true; break;
      case '--all': args.cdkeyPrefix = ''; break;
      case '--cdkey-prefix': args.cdkeyPrefix = next; i += 1; break;
      case '--database-url': args.databaseUrl = next; i += 1; break;
      case '--help':
        printHelp();
        process.exit(0);
        break;
      default:
        break;
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/craigslist/purge-empty-locality.mjs [options]

Delete rows where district or city is empty (NULL or blank).

Options:
  --dry-run              Count only, do not delete
  --cdkey-prefix cl-     Only Craigslist rows (default)
  --all                  All rows in house_ger
  --database-url URL     PostgreSQL URL (default: secrets/us-database.env)

Example:
  node scripts/craigslist/purge-empty-locality.mjs --dry-run
  node scripts/craigslist/purge-empty-locality.mjs
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

function buildWhere(prefix) {
  const locality = `(district IS NULL OR BTRIM(district) = '' OR city IS NULL OR BTRIM(city) = '')`;
  if (!prefix) return locality;
  return `${locality} AND cdkey LIKE $1`;
}

async function main() {
  const args = parseArgs(process.argv);
  const databaseUrl = loadDatabaseUrl(args.databaseUrl);
  const where = buildWhere(args.cdkeyPrefix);
  const params = args.cdkeyPrefix ? [`${args.cdkeyPrefix}%`] : [];

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  try {
    const countSql = `SELECT COUNT(*)::int AS count FROM house_ger WHERE ${where}`;
    const countRes = await client.query(countSql, params);
    const count = countRes.rows[0]?.count ?? 0;

    if (args.dryRun) {
      console.log(`Would delete ${count} rows (${args.cdkeyPrefix ? `cdkey ${args.cdkeyPrefix}*` : 'all rows'})`);
      return;
    }

    if (!count) {
      console.log('No rows to delete.');
      return;
    }

    const deleteSql = `DELETE FROM house_ger WHERE ${where}`;
    const deleteRes = await client.query(deleteSql, params);
    console.log(`Deleted ${deleteRes.rowCount ?? count} rows with empty district or city`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
