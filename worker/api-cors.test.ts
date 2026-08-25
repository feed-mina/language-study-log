import assert from 'node:assert/strict';
import test from 'node:test';

import { withSiteCors } from './cors.ts';
import type { WorkerEnv } from './types.ts';

const siteOrigin = 'https://toeic-daily-study-log.minyerin.chatgpt.site';
const env = { SITE_URL: siteOrigin } as WorkerEnv;

test('materials responses allow only the configured Sites origin', async () => {
  const allowed = withSiteCors(
    Response.json({ ok: true }),
    new Request('https://language-study-log.evolvix.workers.dev/api/materials', {
      headers: { origin: siteOrigin },
    }),
    env,
  );
  assert.equal(allowed.headers.get('access-control-allow-origin'), siteOrigin);
  assert.match(allowed.headers.get('vary') ?? '', /Origin/);
  assert.deepEqual(await allowed.json(), { ok: true });

  const denied = withSiteCors(
    Response.json({ ok: true }),
    new Request('https://language-study-log.evolvix.workers.dev/api/materials', {
      headers: { origin: 'https://untrusted.example' },
    }),
    env,
  );
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
});
