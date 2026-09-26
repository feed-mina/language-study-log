import { env } from 'cloudflare:workers';

import { isAuthorizedDashboardMutation } from '../auth';
import { listArchiveBatches, listStudyLibrary, restoreArchiveBatch } from '../../../../worker/study-library';
import { StudyCycleError } from '../../../../worker/study-cycle';

export const runtime = 'edge';

function database() { return (env as Cloudflare.Env & { DB: D1Database }).DB; }
function json(data: unknown, status = 200) { return Response.json(data, { status, headers: { 'cache-control': 'no-store' } }); }
function failure(error: unknown) {
  if (error instanceof StudyCycleError) return json({ error: { code: error.code, message: error.message } }, error.status);
  return json({ error: { code: 'INTERNAL_ERROR', message: '자료함 요청을 처리하지 못했습니다' } }, 500);
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const library = await listStudyLibrary(database(), {
      kind: params.get('kind'), status: params.get('status'), search: params.get('search'),
      from: params.get('from'), to: params.get('to'), limit: Number(params.get('limit') ?? 24),
    });
    return json({ library, archiveBatches: await listArchiveBatches(database()) });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  const workerEnv = env as Cloudflare.Env & { ADMIN_TOKEN?: string; ACCESS_TEAM_DOMAIN?: string; ACCESS_AUD?: string };
  if (!(await isAuthorizedDashboardMutation(request, {
    adminToken: workerEnv.ADMIN_TOKEN,
    accessTeamDomain: workerEnv.ACCESS_TEAM_DOMAIN,
    accessAud: workerEnv.ACCESS_AUD,
  }))) return json({ error: { code: 'UNAUTHORIZED', message: 'Cloudflare Access login required' } }, 401);
  try {
    const body = await request.json() as Record<string, unknown>;
    return json(await restoreArchiveBatch(database(), {
      batchId: typeof body.batch_id === 'string' ? body.batch_id : '',
      requestId: typeof body.request_id === 'string' ? body.request_id : '',
      confirmed: body.confirmed === true,
    }));
  } catch (error) { return failure(error); }
}
