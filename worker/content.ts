import {
  findContent,
  findContentById,
  finishAutomationRun,
  insertAsset,
  insertContent,
  listAssets,
  startAutomationRun,
} from './db';
import { extractJson, kstDate, kindFromCron, type ContentKind, type ContentRow, type StudyPayload, type WorkerEnv } from './types';

export const CONTENT_MODEL = '@cf/zai-org/glm-4.7-flash';
export const ENGLISH_TTS_MODEL = '@cf/deepgram/aura-2-en';

const prompts: Record<ContentKind, (date: string) => string> = {
  english: (date) => `${date} 영어 아침 학습 자료를 한국인 중급 학습자용으로 작성하세요. 일상에서 바로 말할 수 있는 핵심 영어 문장 5개를 만들고, 첫 문장은 speakingSentence에도 그대로 넣으세요.`,
  japanese: (date) => `${date} 일본어 아침 학습 자료를 한국인 초중급 학습자용으로 작성하세요. 생활 일본어 문장 5개와 자연스러운 한국어 설명을 제공하세요.`,
  toeic: (date) => `${date} TOEIC 학습 자료를 작성하세요. 월요일부터 토요일까지 사용할 수 있도록 LC 또는 RC 실전 문제 5개와 정답 및 간단한 오답 포인트를 제공하세요.`,
};

function systemPrompt(): string {
  return `당신은 정확하고 친절한 언어 학습 교사입니다. 반드시 JSON 객체 하나만 반환하세요.
스키마: {"title":"string","summary":"string","speakingSentence":"string optional","speakingMeaning":"string optional","items":[{"prompt":"string","answer":"string","explanation":"string"}]}
마크다운 코드 펜스나 스키마 밖의 텍스트는 쓰지 마세요.`;
}

export async function generateContent(env: WorkerEnv, date: string, kind: ContentKind): Promise<ContentRow> {
  const existing = await findContent(env, date, kind);
  if (existing) return existing;

  const response = await env.AI.run(CONTENT_MODEL, {
    messages: [
      { role: 'system', content: systemPrompt() },
      { role: 'user', content: prompts[kind](date) },
    ],
    temperature: 0.4,
    max_tokens: 1800,
  });
  const payload = extractJson(response);
  const stored = await insertContent(env, date, kind, payload, CONTENT_MODEL);
  if (kind === 'english') await ensureEnglishAudio(env, stored, payload);
  return stored;
}

function payloadFrom(row: ContentRow): StudyPayload {
  return extractJson(JSON.parse(row.body_json) as unknown);
}

export async function ensureEnglishAudio(env: WorkerEnv, content: ContentRow, payload = payloadFrom(content)): Promise<void> {
  const current = await listAssets(env, content.id);
  if (current.some((asset) => asset.kind === 'speaking-audio')) return;
  if (!payload.speakingSentence) return;

  const response = await env.AI.run(
    ENGLISH_TTS_MODEL,
    { text: payload.speakingSentence, speaker: 'luna' },
    { returnRawResponse: true },
  );
  if (!response.ok || !response.body) throw new Error(`TTS generation failed (${response.status})`);

  const id = crypto.randomUUID();
  const filename = `${content.content_date}-english-sentence.mp3`;
  const key = `generated/${content.content_date}/english/${id}.mp3`;
  const object = await env.STUDY_ASSETS.put(key, response.body, {
    httpMetadata: { contentType: 'audio/mpeg', contentDisposition: `attachment; filename="${filename}"` },
    customMetadata: { contentId: content.id, kind: 'speaking-audio' },
  });
  await insertAsset(env, {
    id,
    content_id: content.id,
    kind: 'speaking-audio',
    r2_key: key,
    filename,
    content_type: 'audio/mpeg',
    bytes: object.size,
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function deliverContent(env: WorkerEnv, content: ContentRow): Promise<{ sent: boolean; messageId?: string }> {
  const to = env.STUDY_EMAIL_TO?.trim();
  const from = env.STUDY_EMAIL_FROM?.trim();
  if (!to || !from) throw new Error('STUDY_EMAIL_TO and STUDY_EMAIL_FROM must be configured');

  const recipientHash = await sha256(to.toLowerCase());
  const now = new Date().toISOString();
  let deliveryId = crypto.randomUUID();
  const claim = await env.DB.prepare(`INSERT OR IGNORE INTO delivery_logs
    (id, content_id, channel, recipient_hash, status, provider_id, error, created_at, updated_at)
    VALUES (?, ?, 'email', ?, 'sending', '', '', ?, ?)`)
    .bind(deliveryId, content.id, recipientHash, now, now)
    .run();
  if ((claim.meta.changes ?? 0) === 0) {
    const previous = await env.DB.prepare(`SELECT id, status FROM delivery_logs
      WHERE content_id = ? AND channel = 'email' AND recipient_hash = ? LIMIT 1`)
      .bind(content.id, recipientHash)
      .first<{ id: string; status: string }>();
    if (!previous || previous.status !== 'failed') return { sent: false };
    const retry = await env.DB.prepare(`UPDATE delivery_logs
      SET status = 'sending', error = '', updated_at = ? WHERE id = ? AND status = 'failed'`)
      .bind(now, previous.id)
      .run();
    if ((retry.meta.changes ?? 0) === 0) return { sent: false };
    deliveryId = previous.id;
  }

  const payload = payloadFrom(content);
  const siteUrl = (env.SITE_URL ?? '').replace(/\/$/, '');
  const assetRows = await listAssets(env, content.id);
  const audio = assetRows.find((asset) => asset.kind === 'speaking-audio' && asset.bytes <= 4 * 1024 * 1024);
  const attachments: EmailAttachment[] = [];
  if (audio) {
    const object = await env.STUDY_ASSETS.get(audio.r2_key);
    if (object) attachments.push({
      disposition: 'attachment',
      filename: audio.filename,
      type: audio.content_type,
      content: await object.arrayBuffer(),
    });
  }

  const lines = payload.items.map((item, index) => `${index + 1}. ${item.prompt}\n정답: ${item.answer}\n설명: ${item.explanation}`);
  const text = `${payload.title}\n\n${payload.summary}\n\n${lines.join('\n\n')}\n\n학습 기록: ${siteUrl}`;
  const htmlItems = payload.items.map((item, index) => `<li><strong>${index + 1}. ${escapeHtml(item.prompt)}</strong><br>정답: ${escapeHtml(item.answer)}<br><small>${escapeHtml(item.explanation)}</small></li>`).join('');
  const html = `<h1>${escapeHtml(payload.title)}</h1><p>${escapeHtml(payload.summary)}</p><ol>${htmlItems}</ol><p><a href="${escapeHtml(siteUrl)}">오늘 학습 기록하기</a></p>`;

  try {
    const result = await env.EMAIL.send({
      to,
      from: { email: from, name: 'Language Study Log' },
      subject: `[${content.content_date}] ${content.title}`,
      text,
      html,
      attachments,
    });
    await env.DB.prepare(`UPDATE delivery_logs SET status = 'sent', provider_id = ?, updated_at = ? WHERE id = ?`)
      .bind(result.messageId, new Date().toISOString(), deliveryId)
      .run();
    return { sent: true, messageId: result.messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown email error';
    await env.DB.prepare(`UPDATE delivery_logs SET status = 'failed', error = ?, updated_at = ? WHERE id = ?`)
      .bind(message.slice(0, 1000), new Date().toISOString(), deliveryId)
      .run();
    throw error;
  }
}

export async function generateAndDeliver(env: WorkerEnv, date: string, kind: ContentKind, sendEmail = true): Promise<{ content: ContentRow; sent: boolean; messageId?: string }> {
  const content = await generateContent(env, date, kind);
  if (kind === 'english') await ensureEnglishAudio(env, content);
  if (!sendEmail) return { content, sent: false };
  const delivery = await deliverContent(env, content);
  return { content, ...delivery };
}

export async function deliverContentById(env: WorkerEnv, contentId: string): Promise<{ sent: boolean; messageId?: string }> {
  const content = await findContentById(env, contentId);
  if (!content) throw new Error('Study content not found');
  return deliverContent(env, content);
}

export async function runScheduled(controller: ScheduledController, env: WorkerEnv): Promise<void> {
  const kind = kindFromCron(controller.cron);
  if (!kind) {
    console.warn(JSON.stringify({ event: 'cron_skipped', cron: controller.cron }));
    return;
  }
  const date = kstDate(controller.scheduledTime);
  const runId = await startAutomationRun(env, kind, new Date(controller.scheduledTime).toISOString());
  try {
    const result = await generateAndDeliver(env, date, kind, true);
    await finishAutomationRun(env, runId, 'completed', JSON.stringify({ contentId: result.content.id, sent: result.sent }));
    console.log(JSON.stringify({ event: 'cron_completed', kind, date, contentId: result.content.id, sent: result.sent }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown scheduled error';
    await finishAutomationRun(env, runId, 'failed', message);
    console.error(JSON.stringify({ event: 'cron_failed', kind, date, message }));
    throw error;
  }
}
