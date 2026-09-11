import { env } from 'cloudflare:workers';
import { isAuthorizedDashboardMutation } from '../auth';
import { ensureAutomationSchema } from '../../../../worker/db';
import { ensureScheduleSchema } from '../../../../worker/schedule-schema';
import { mutateSchedule, rateSessionCard, readSchedule, recoveryPage, ScheduleError, sessionCards } from '../../../../worker/study-schedule';
import { StudyCycleError } from '../../../../worker/study-cycle';
import type { WorkerEnv } from '../../../../worker/types';

export const runtime = 'edge';
function json(data: unknown, status = 200) { return Response.json(data, { status, headers: { 'cache-control': 'no-store' } }); }
function failure(error: unknown) {
  if (error instanceof ScheduleError || error instanceof StudyCycleError) return json({ error: error.message }, error.status);
  const message = error instanceof Error ? error.message + ' ' + String(error.cause ?? '') : '';
  if (/TIME_CONFLICT/.test(message)) return json({ error: '기존 공부 시간과 겹칩니다. 다른 시각을 선택하세요.' }, 409);
  if (/TIME_OVERFLOW/.test(message)) return json({ error: '공부 시간이 자정을 넘습니다.' }, 400);
  if (/REVIEW_CONFLICT|UNIQUE constraint/.test(message)) return json({ error: '다른 요청에서 이미 변경한 항목입니다. 새로고침 후 다시 시도하세요.' }, 409);
  if (/시각은 HH/.test(message)) return json({ error: '시각은 HH:MM 형식으로 입력하세요.' }, 400);
  return json({ error: '일정을 처리하지 못했습니다. 입력을 유지한 채 다시 시도해 주세요.' }, 500);
}
export async function GET(request: Request) {
  try {
    const workerEnv = env as WorkerEnv;
    await ensureAutomationSchema(workerEnv);
    const params = new URL(request.url).searchParams;
    if (params.get('mode') === 'recovery') return json(await recoveryPage(workerEnv.DB, params));
    await ensureScheduleSchema(workerEnv.DB);
    if (params.get('session')) return json({ cards: await sessionCards(workerEnv.DB, params.get('session')!.slice(0, 120)) });
    return json(await readSchedule(workerEnv.DB, params));
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  const workerEnv = env as WorkerEnv;
  if (!await isAuthorizedDashboardMutation(request, { adminToken: workerEnv.ADMIN_TOKEN, accessTeamDomain: workerEnv.ACCESS_TEAM_DOMAIN, accessAud: workerEnv.ACCESS_AUD })) return json({ error: 'Google 인증이 필요합니다.' }, 401);
  try {
    // Bound even chunked request bodies before parsing.
    const reader = request.body?.getReader(); if (!reader) return json({ error: '요청 내용이 없습니다.' }, 400);
    const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 16384) { await reader.cancel(); return json({ error: '요청이 너무 큽니다.' }, 413); } chunks.push(value); } } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let body: unknown; try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return json({ error: '요청 형식이 올바르지 않습니다.' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: '요청 형식이 올바르지 않습니다.' }, 400);
    const input = body as Record<string, unknown>;
    await ensureAutomationSchema(workerEnv); await ensureScheduleSchema(workerEnv.DB);
    return json(input.action === 'rate' ? await rateSessionCard(workerEnv.DB, input) : await mutateSchedule(workerEnv.DB, input));
  } catch (error) { return failure(error); }
}
