import { env } from 'cloudflare:workers';

import { verifyAccessIdentity } from '../auth';

export const runtime = 'edge';

function json(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set('cache-control', 'no-store');
  return Response.json(data, { ...init, headers });
}

export async function GET(request: Request) {
  const workerEnv = env as Cloudflare.Env & { ACCESS_TEAM_DOMAIN?: string; ACCESS_AUD?: string };
  const identity = await verifyAccessIdentity(request, {
    accessTeamDomain: workerEnv.ACCESS_TEAM_DOMAIN,
    accessAud: workerEnv.ACCESS_AUD,
  });
  return identity
    ? json({ authenticated: true, email: identity.email })
    : json({ authenticated: false }, { status: 401 });
}
