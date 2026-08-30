import { env } from 'cloudflare:workers';

import {
  clearDashboardSessionCookie,
  createDashboardSession,
  dashboardSessionCookie,
  hasDashboardSession,
  isSameOriginRequest,
  verifyAdminToken,
} from '../auth';

export const runtime = 'edge';

function adminToken(): string | undefined {
  return (env as Cloudflare.Env & { ADMIN_TOKEN?: string }).ADMIN_TOKEN;
}

function json(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set('cache-control', 'no-store');
  return Response.json(data, { ...init, headers });
}

export async function GET(request: Request) {
  return json({ authenticated: await hasDashboardSession(request, adminToken()) });
}

export async function POST(request: Request) {
  const configuredToken = adminToken();
  if (!configuredToken) return json({ error: 'administrator login is not configured' }, { status: 503 });
  if (!isSameOriginRequest(request)) return json({ error: 'same-origin request required' }, { status: 403 });
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (!Number.isFinite(contentLength) || contentLength > 4096) return json({ error: 'request body is too large' }, { status: 413 });

  let token: unknown;
  try {
    const body = await request.json() as Record<string, unknown>;
    token = body.token;
  } catch {
    return json({ error: 'valid JSON required' }, { status: 400 });
  }
  if (typeof token !== 'string' || token.length > 1024 || !(await verifyAdminToken(token, configuredToken))) {
    return json({ error: 'invalid administrator token' }, { status: 401 });
  }

  const session = await createDashboardSession(configuredToken);
  return json({ authenticated: true }, { headers: { 'set-cookie': dashboardSessionCookie(session) } });
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) return json({ error: 'same-origin request required' }, { status: 403 });
  return json({ authenticated: false }, { headers: { 'set-cookie': clearDashboardSessionCookie() } });
}
