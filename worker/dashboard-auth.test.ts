import assert from 'node:assert/strict';
import test from 'node:test';

import { SignJWT } from 'jose';

import {
  isAuthorizedDashboardMutation,
  verifyAccessIdentity,
  verifyAdminToken,
} from '../app/api/dashboard/auth.ts';

const workerOrigin = 'https://language-study-log.evolvix.workers.dev';
const adminToken = 'test-admin-token-with-enough-entropy';
const accessTeamDomain = 'https://example-team.cloudflareaccess.com';
const accessAud = 'test-access-audience-1234567890';
const signingKey = new TextEncoder().encode('test-access-signing-key-with-enough-entropy');
const authConfig = { adminToken, accessTeamDomain, accessAud };

async function accessToken(overrides: { issuer?: string; audience?: string; email?: string } = {}) {
  return new SignJWT({ email: overrides.email ?? 'owner@example.com' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(overrides.issuer ?? accessTeamDomain)
    .setAudience(overrides.audience ?? accessAud)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(signingKey);
}

test('accepts the configured administrator Bearer token only', async () => {
  const allowed = new Request(`${workerOrigin}/api/dashboard`, {
    method: 'POST',
    headers: { authorization: `Bearer ${adminToken}` },
  });
  const denied = new Request(`${workerOrigin}/api/dashboard`, {
    method: 'POST',
    headers: { authorization: 'Bearer wrong-token' },
  });
  assert.equal(await isAuthorizedDashboardMutation(allowed, authConfig, signingKey), true);
  assert.equal(await isAuthorizedDashboardMutation(denied, authConfig, signingKey), false);
  assert.equal(await verifyAdminToken(adminToken, adminToken), true);
  assert.equal(await verifyAdminToken('wrong-token', adminToken), false);
});

test('accepts a verified Cloudflare Access identity for same-origin browser writes', async () => {
  const request = new Request(`${workerOrigin}/api/dashboard`, {
    method: 'PATCH',
    headers: {
      origin: workerOrigin,
      'cf-access-jwt-assertion': await accessToken(),
    },
  });
  assert.deepEqual(await verifyAccessIdentity(request, authConfig, signingKey), { email: 'owner@example.com' });
  assert.equal(await isAuthorizedDashboardMutation(request, authConfig, signingKey), true);
});

test('rejects cross-origin and invalid Access tokens', async () => {
  const validToken = await accessToken();
  const crossOrigin = new Request(`${workerOrigin}/api/dashboard`, {
    method: 'DELETE',
    headers: { origin: 'https://attacker.example', 'cf-access-jwt-assertion': validToken },
  });
  const wrongIssuer = new Request(`${workerOrigin}/api/dashboard`, {
    method: 'POST',
    headers: { origin: workerOrigin, 'cf-access-jwt-assertion': await accessToken({ issuer: 'https://attacker.example' }) },
  });
  const wrongAudience = new Request(`${workerOrigin}/api/dashboard`, {
    method: 'POST',
    headers: { origin: workerOrigin, 'cf-access-jwt-assertion': await accessToken({ audience: 'different-access-audience-1234' }) },
  });
  assert.equal(await isAuthorizedDashboardMutation(crossOrigin, authConfig, signingKey), false);
  assert.equal(await isAuthorizedDashboardMutation(wrongIssuer, authConfig, signingKey), false);
  assert.equal(await isAuthorizedDashboardMutation(wrongAudience, authConfig, signingKey), false);
});

test('fails closed when Access configuration or identity is missing', async () => {
  const missingToken = new Request(`${workerOrigin}/api/dashboard`, { method: 'POST', headers: { origin: workerOrigin } });
  const missingEmail = new Request(`${workerOrigin}/api/dashboard`, {
    method: 'POST',
    headers: {
      origin: workerOrigin,
      'cf-access-jwt-assertion': await new SignJWT({})
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer(accessTeamDomain)
        .setAudience(accessAud)
        .setExpirationTime('5m')
        .sign(signingKey),
    },
  });
  assert.equal(await isAuthorizedDashboardMutation(missingToken, authConfig, signingKey), false);
  assert.equal(await verifyAccessIdentity(missingEmail, authConfig, signingKey), null);
  assert.equal(await verifyAccessIdentity(missingEmail, { accessTeamDomain: '', accessAud }, signingKey), null);
});
