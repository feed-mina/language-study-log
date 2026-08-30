import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDashboardSession,
  dashboardSessionCookie,
  isAuthorizedDashboardMutation,
  verifyAdminToken,
  verifyDashboardSession,
} from '../app/api/dashboard/auth.ts';

const workerOrigin = 'https://language-study-log.evolvix.workers.dev';
const adminToken = 'test-admin-token-with-enough-entropy';
const now = Date.UTC(2026, 7, 30, 1, 0, 0);

test('accepts the configured administrator Bearer token only', async () => {
  const allowed = new Request(`${workerOrigin}/api/dashboard`, {
    method: 'POST',
    headers: { authorization: `Bearer ${adminToken}` },
  });
  const denied = new Request(`${workerOrigin}/api/dashboard`, {
    method: 'POST',
    headers: { authorization: 'Bearer wrong-token' },
  });
  assert.equal(await isAuthorizedDashboardMutation(allowed, adminToken, now), true);
  assert.equal(await isAuthorizedDashboardMutation(denied, adminToken, now), false);
  assert.equal(await verifyAdminToken(adminToken, adminToken), true);
  assert.equal(await verifyAdminToken('wrong-token', adminToken), false);
});

test('accepts a signed same-origin browser session', async () => {
  const session = await createDashboardSession(adminToken, now);
  const request = new Request(`${workerOrigin}/api/dashboard`, {
    method: 'PATCH',
    headers: {
      cookie: `theme=green; __Host-language-study-admin=${session}`,
      origin: workerOrigin,
    },
  });
  assert.equal(await verifyDashboardSession(session, adminToken, now), true);
  assert.equal(await isAuthorizedDashboardMutation(request, adminToken, now), true);
});

test('rejects cross-origin, tampered, and expired sessions', async () => {
  const session = await createDashboardSession(adminToken, now);
  const crossOrigin = new Request(`${workerOrigin}/api/dashboard`, {
    method: 'DELETE',
    headers: { cookie: `__Host-language-study-admin=${session}`, origin: 'https://attacker.example' },
  });
  assert.equal(await isAuthorizedDashboardMutation(crossOrigin, adminToken, now), false);
  const tamperedIndex = session.lastIndexOf('.') + 5;
  const tampered = `${session.slice(0, tamperedIndex)}${session[tamperedIndex] === 'a' ? 'b' : 'a'}${session.slice(tamperedIndex + 1)}`;
  assert.equal(await verifyDashboardSession(tampered, adminToken, now), false);
  assert.equal(await verifyDashboardSession(session, adminToken, now + 13 * 60 * 60 * 1000), false);
});

test('session cookie is host-only, secure, and inaccessible to scripts', async () => {
  const cookie = dashboardSessionCookie(await createDashboardSession(adminToken, now));
  assert.match(cookie, /^__Host-language-study-admin=/);
  assert.match(cookie, /; Path=\//);
  assert.match(cookie, /; HttpOnly/);
  assert.match(cookie, /; Secure/);
  assert.match(cookie, /; SameSite=Strict/);
});
