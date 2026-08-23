import { readFileSync, writeFileSync } from 'node:fs';

const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID?.trim();
if (!databaseId || !/^[a-f0-9-]{32,36}$/i.test(databaseId)) {
  throw new Error('CLOUDFLARE_D1_DATABASE_ID is missing or invalid');
}

const path = new URL('../wrangler.jsonc', import.meta.url);
const config = readFileSync(path, 'utf8');
if (!config.includes('REPLACE_WITH_D1_DATABASE_ID')) {
  throw new Error('D1 placeholder was not found in wrangler.jsonc');
}
writeFileSync(path, config.replace('REPLACE_WITH_D1_DATABASE_ID', databaseId));
