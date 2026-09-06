import { env } from 'cloudflare:workers';

import { ensureStudyCycleSchema, isDate, readIntegrationStudy, StudyCycleError } from '../../../../../worker/study-cycle';
import { authorizePrivateCycleIntegration } from '../auth';

export const runtime = 'edge';

function json(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set('cache-control', 'no-store');
  return Response.json(data, { ...init, headers });
}

export async function GET(request: Request) {
  const workerEnv = env as Cloudflare.Env & { LANGUAGE_INTEGRATION_TOKEN?: string; PRIVATE_OWNER_EMAIL?: string };
  const authorization = await authorizePrivateCycleIntegration(request, {
    integrationToken: workerEnv.LANGUAGE_INTEGRATION_TOKEN,
    privateOwnerEmail: workerEnv.PRIVATE_OWNER_EMAIL,
  });
  if (!authorization.ok) return json({ error: { code: authorization.code, message: authorization.message } }, { status: authorization.status });

  const url = new URL(request.url);
  const fallbackDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  const date = url.searchParams.get('date') ?? fallbackDate;
  if (!isDate(date)) return json({ error: { code: 'INVALID_DATE', message: 'date must use YYYY-MM-DD' } }, { status: 400 });

  try {
    await ensureStudyCycleSchema(workerEnv.DB);
    return json(await readIntegrationStudy(workerEnv.DB, date));
  } catch (error) {
    if (error instanceof StudyCycleError) return json({ error: { code: error.code, message: error.message } }, { status: error.status });
    return json({ error: { code: 'INTERNAL_ERROR', message: 'The integration request could not be completed' } }, { status: 500 });
  }
}
