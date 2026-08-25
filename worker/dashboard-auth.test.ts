import assert from 'node:assert/strict';
import test from 'node:test';

import { isTrustedDashboardMutation } from '../app/api/dashboard/auth.ts';

const siteUrl = 'https://toeic-daily-study-log.minyerin.chatgpt.site';

test('allows a platform-authenticated request on the configured site host', () => {
  const request = new Request(`${siteUrl}/api/dashboard`, {
    method: 'POST',
    headers: { 'oai-authenticated-user-email': 'owner@example.com' },
  });
  assert.equal(isTrustedDashboardMutation(request, siteUrl), true);
});

test('rejects missing identity and direct Worker hosts', () => {
  assert.equal(isTrustedDashboardMutation(new Request(`${siteUrl}/api/dashboard`), siteUrl), false);
  const direct = new Request('https://language-study-log.example.workers.dev/api/dashboard', {
    method: 'POST',
    headers: { 'oai-authenticated-user-email': 'owner@example.com' },
  });
  assert.equal(isTrustedDashboardMutation(direct, siteUrl), false);
});

test('rejects non-HTTPS or malformed configured URLs', () => {
  const request = new Request('http://toeic-daily-study-log.minyerin.chatgpt.site/api/dashboard', {
    method: 'POST',
    headers: { 'oai-authenticated-user-email': 'owner@example.com' },
  });
  assert.equal(isTrustedDashboardMutation(request, siteUrl), false);
  assert.equal(isTrustedDashboardMutation(request, 'not a URL'), false);
});
