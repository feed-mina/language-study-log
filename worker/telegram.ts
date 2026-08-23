const TELEGRAM_API_BASE = 'https://api.telegram.org';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_MESSAGE_LENGTH = 3_900;

type Fetcher = typeof fetch;

export interface TelegramEnv {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}

export interface TelegramAudio {
  content: ArrayBuffer;
  filename: string;
  type: string;
  caption?: string;
}

export interface TelegramStudyMessage {
  text: string;
  siteUrl?: string;
  audio?: TelegramAudio;
}

interface TelegramResponse {
  ok?: unknown;
  description?: unknown;
  error_code?: unknown;
  result?: {
    message_id?: unknown;
  };
}

function configuredValue(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

export function telegramConfigured(env: TelegramEnv): boolean {
  return configuredValue(env.TELEGRAM_BOT_TOKEN) && configuredValue(env.TELEGRAM_CHAT_ID);
}

export function splitTelegramText(value: string, maxLength = MAX_MESSAGE_LENGTH): string[] {
  if (!Number.isInteger(maxLength) || maxLength < 100 || maxLength > 4_096) {
    throw new Error('Invalid Telegram message length');
  }
  let remaining = value.trim();
  if (!remaining) throw new Error('Telegram message text is empty');
  const chunks: string[] = [];
  while (remaining.length > maxLength) {
    const window = remaining.slice(0, maxLength + 1);
    let splitAt = window.lastIndexOf('\n');
    if (splitAt < Math.floor(maxLength * 0.6)) splitAt = window.lastIndexOf(' ');
    if (splitAt < Math.floor(maxLength * 0.6)) splitAt = maxLength;
    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function safeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 120) || 'study-audio.mp3';
}

function safeSiteUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

async function jsonBody(response: Response): Promise<TelegramResponse | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel('Response body exceeded limit');
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes)) as TelegramResponse;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

async function telegramRequest(
  token: string,
  method: 'sendMessage' | 'sendAudio',
  init: RequestInit,
  fetcher: Fetcher,
): Promise<string> {
  const response = await fetcher(`${TELEGRAM_API_BASE}/bot${token}/${method}`, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await jsonBody(response);
  const messageId = body?.result?.message_id;
  if (!response.ok || body?.ok !== true || (typeof messageId !== 'number' && typeof messageId !== 'string')) {
    const code = typeof body?.error_code === 'number' ? `, code ${body.error_code}` : '';
    throw new Error(`Telegram ${method} failed (HTTP ${response.status}${code})`);
  }
  return String(messageId);
}

export async function sendTelegramStudy(
  env: TelegramEnv,
  message: TelegramStudyMessage,
  fetcher: Fetcher = fetch,
): Promise<{ messageIds: string[] }> {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId || !telegramConfigured(env)) throw new Error('Telegram delivery is not configured');

  const messageIds: string[] = [];
  if (message.audio) {
    const form = new FormData();
    form.set('chat_id', chatId);
    form.set('audio', new Blob([message.audio.content], { type: message.audio.type }), safeFilename(message.audio.filename));
    if (message.audio.caption?.trim()) form.set('caption', message.audio.caption.trim().slice(0, 900));
    messageIds.push(await telegramRequest(token, 'sendAudio', { method: 'POST', body: form }, fetcher));
  }

  const chunks = splitTelegramText(message.text);
  const siteUrl = safeSiteUrl(message.siteUrl);
  for (let index = 0; index < chunks.length; index += 1) {
    const isLast = index === chunks.length - 1;
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text: chunks[index],
      link_preview_options: { is_disabled: true },
    };
    if (isLast && siteUrl) {
      body.reply_markup = {
        inline_keyboard: [[{ text: '오늘 학습 기록하기', url: siteUrl }]],
      };
    }
    messageIds.push(await telegramRequest(token, 'sendMessage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }, fetcher));
  }
  return { messageIds };
}
