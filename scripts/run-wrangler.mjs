import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const logDirectory = resolve(projectRoot, '.wrangler', 'logs');
mkdirSync(logDirectory, { recursive: true });

const result = spawnSync(
  process.execPath,
  [resolve(projectRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), ...process.argv.slice(2)],
  {
    env: {
      ...process.env,
      WRANGLER_LOG_PATH: resolve(logDirectory, 'wrangler.log'),
      WRANGLER_WRITE_LOGS: 'false',
    },
    stdio: 'inherit',
  },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
