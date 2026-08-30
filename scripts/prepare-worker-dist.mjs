import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const configPath = resolve('dist/server/wrangler.json');
const config = JSON.parse(await readFile(configPath, 'utf8'));

// vinext 1.0.0-beta.3 still emits this removed Wrangler option.
// Wrangler v4 deploys each environment as its own Worker by default, so removing it is behavior-preserving.
delete config.legacy_env;

await writeFile(configPath, `${JSON.stringify(config)}\n`, 'utf8');
