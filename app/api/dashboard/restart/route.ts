import { env } from 'cloudflare:workers';

import { isAuthorizedDashboardMutation } from '../auth';
import { ensureStudyCycleSchema, isDate, StudyCycleError } from '../../../../worker/study-cycle';
import { executeStudyRestart, previewStudyRestart } from '../../../../worker/restart-cycle';

export const runtime = 'edge';

function database() {
  return (env as Cloudflare.Env & { DB: D1Database }).DB;
}

function workerConfig() {
  const workerEnv = env as Cloudflare.Env & { ADMIN_TOKEN?: string; ACCESS_TEAM_DOMAIN?: string; ACCESS_AUD?: string };
  return { adminToken: workerEnv.ADMIN_TOKEN, accessTeamDomain: workerEnv.ACCESS_TEAM_DOMAIN, accessAud: workerEnv.ACCESS_AUD };
}

function json(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set('cache-control', 'no-store');
  return Response.json(data, { ...init, headers });
}

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get('date') ?? today();
  if (!isDate(date)) return json({ error: { code: 'INVALID_DATE', message: 'date must use YYYY-MM-DD' } }, { status: 400 });
  try {
    await ensureStudyCycleSchema(database());
    return json(await previewStudyRestart(database(), date));
  } catch (error) {
    if (error instanceof StudyCycleError) return json({ error: { code: error.code, message: error.message } }, { status: error.status });
    return json({ error: { code: 'INTERNAL_ERROR', message: 'restart preview failed' } }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await isAuthorizedDashboardMutation(request, workerConfig()))) {
    return json({ error: { code: 'UNAUTHORIZED', message: 'Cloudflare Access login required' } }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json() as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object required');
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: { code: 'INVALID_JSON', message: 'JSON object required' } }, { status: 400 });
  }
  try {
    await ensureStudyCycleSchema(database());
    const result = await executeStudyRestart(database(), {
      requestId: typeof body.request_id === 'string' ? body.request_id : '',
      restartDate: typeof body.restart_date === 'string' ? body.restart_date : '',
      expectedBacklogCount: Number(body.expected_backlog_count),
      snapshotToken: typeof body.snapshot_token === 'string' ? body.snapshot_token : '',
      confirmed: body.confirmed === true,
    });
    return json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    if (error instanceof StudyCycleError) return json({ error: { code: error.code, message: error.message } }, { status: error.status });
    return json({ error: { code: 'INTERNAL_ERROR', message: 'study restart failed' } }, { status: 500 });
  }
}
