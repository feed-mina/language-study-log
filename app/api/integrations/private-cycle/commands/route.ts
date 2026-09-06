import { env } from 'cloudflare:workers';

import { ensureStudyCycleSchema, executePlanCommand, isPlanCommand, StudyCycleError } from '../../../../../worker/study-cycle';
import { authorizePrivateCycleIntegration } from '../auth';

export const runtime = 'edge';

function json(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set('cache-control', 'no-store');
  return Response.json(data, { ...init, headers });
}

export async function POST(request: Request) {
  const workerEnv = env as Cloudflare.Env & { LANGUAGE_INTEGRATION_TOKEN?: string; PRIVATE_OWNER_EMAIL?: string };
  const authorization = await authorizePrivateCycleIntegration(request, {
    integrationToken: workerEnv.LANGUAGE_INTEGRATION_TOKEN,
    privateOwnerEmail: workerEnv.PRIVATE_OWNER_EMAIL,
  });
  if (!authorization.ok) return json({ error: { code: authorization.code, message: authorization.message } }, { status: authorization.status });

  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (contentLength > 16 * 1024) return json({ error: { code: 'REQUEST_TOO_LARGE', message: 'Request body is too large' } }, { status: 413 });

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json() as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object required');
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: { code: 'INVALID_JSON', message: 'JSON object required' } }, { status: 400 });
  }
  if (!isPlanCommand(body.command)) {
    return json({ error: { code: 'INVALID_COMMAND', message: 'Unsupported study plan command' } }, { status: 400 });
  }

  try {
    await ensureStudyCycleSchema(workerEnv.DB);
    const result = await executePlanCommand(workerEnv.DB, {
      requestId: typeof body.request_id === 'string' ? body.request_id : '',
      command: body.command,
      planId: typeof body.plan_id === 'string' ? body.plan_id : '',
      targetDate: typeof body.target_date === 'string' ? body.target_date : null,
      archiveReason: typeof body.archive_reason === 'string' ? body.archive_reason : '',
      minutes: typeof body.minutes === 'number' ? body.minutes : undefined,
      score: typeof body.score === 'string' ? body.score : undefined,
      note: typeof body.note === 'string' ? body.note : undefined,
      confusedItems: typeof body.confused_items === 'string' ? body.confused_items : undefined,
    });
    return json(result);
  } catch (error) {
    if (error instanceof StudyCycleError) return json({ error: { code: error.code, message: error.message } }, { status: error.status });
    return json({ error: { code: 'INTERNAL_ERROR', message: 'The integration command could not be completed' } }, { status: 500 });
  }
}
