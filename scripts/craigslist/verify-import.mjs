import fs from 'node:fs';
import pg from 'pg';

const line = fs.readFileSync('secrets/us-database.env', 'utf8')
  .split('\n')
  .find((row) => row.startsWith('DATABASE_URL='));
const url = line.slice('DATABASE_URL='.length).trim();
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const res = await client.query(`
  SELECT cdkey, name, display_state, display_city, display_district, price, room, loft, pic_count
  FROM house_ger
  WHERE cdkey LIKE 'cl-%'
  ORDER BY create_time DESC
  LIMIT 10
`);

console.log(`Found ${res.rowCount} Craigslist rows:`);
for (const row of res.rows) {
  console.log(`- ${row.cdkey} | ${row.name?.slice(0, 40)} | ${row.display_district}, ${row.display_city}, ${row.display_state} | ${row.price} | room=${row.room} loft=${row.loft} pics=${row.pic_count}`);
}

await client.end();
