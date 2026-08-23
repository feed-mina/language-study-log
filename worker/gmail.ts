import { Buffer } from 'node:buffer';

const GMAIL_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 64 * 1024;

export interface GmailAttachment {
  content: ArrayBuffer;
  filename: string;
  type: string;
}

export interface GmailMessage {
  to: string;
  from: string;
  fromName: string;
  subject: string;
  text: string;
  html: string;
  attachments: GmailAttachment[];
}

type Fetcher = typeof fetch;

export interface GmailEnv {
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;
  GMAIL_REFRESH_TOKEN?: string;
  STUDY_EMAIL_TO?: string;
  STUDY_EMAIL_FROM?: string;
}

interface TokenResponse {
  access_token?: unknown;
  error?: unknown;
}

interface SendResponse {
  id?: unknown;
  error?: {
    status?: unknown;
  };
}

function configuredValue(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

export function gmailConfigured(env: GmailEnv): boolean {
  return configuredValue(env.GMAIL_CLIENT_ID)
    && configuredValue(env.GMAIL_CLIENT_SECRET)
    && configuredValue(env.GMAIL_REFRESH_TOKEN)
    && configuredValue(env.STUDY_EMAIL_TO)
    && configuredValue(env.STUDY_EMAIL_FROM);
}

function assertEmailAddress(value: string): void {
  if (value.length > 254 || /[\r\n]/.test(value) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error('Invalid email address configuration');
  }
}

function encodeHeader(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function wrapBase64(value: string): string {
  return value.match(/.{1,76}/g)?.join('\r\n') ?? '';
}

function textBase64(value: string): string {
  return wrapBase64(Buffer.from(value, 'utf8').toString('base64'));
}

function safeFilename(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 120);
  return sanitized || 'attachment.bin';
}

export function buildGmailRawMessage(message: GmailMessage): string {
  assertEmailAddress(message.to);
  assertEmailAddress(message.from);

  const mixedBoundary = `----=_LanguageStudy_${crypto.randomUUID()}`;
  const alternativeBoundary = `----=_LanguageStudyAlt_${crypto.randomUUID()}`;
  const rows = [
    `From: ${message.fromName.replace(/[\r\n]/g, ' ')} <${message.from}>`,
    `To: ${message.to}`,
    `Subject: ${encodeHeader(message.subject.replace(/[\r\n]/g, ' '))}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    '',
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
    '',
    `--${alternativeBoundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    textBase64(message.text),
    `--${alternativeBoundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    textBase64(message.html),
    `--${alternativeBoundary}--`,
  ];

  for (const attachment of message.attachments) {
    const filename = safeFilename(attachment.filename);
    rows.push(
      `--${mixedBoundary}`,
      `Content-Type: ${attachment.type}; name="${filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${filename}"`,
      '',
      wrapBase64(Buffer.from(attachment.content).toString('base64')),
    );
  }
  rows.push(`--${mixedBoundary}--`, '');

  return Buffer.from(rows.join('\r\n'), 'utf8').toString('base64url');
}

async function jsonBody<T>(response: Response): Promise<T | null> {
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
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

async function accessToken(env: GmailEnv, fetcher: Fetcher): Promise<string> {
  const clientId = env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = env.GMAIL_CLIENT_SECRET?.trim();
  const refreshToken = env.GMAIL_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) throw new Error('Gmail OAuth secrets are not configured');

  const response = await fetcher(GMAIL_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await jsonBody<TokenResponse>(response);
  if (!response.ok || typeof body?.access_token !== 'string' || !body.access_token) {
    const code = typeof body?.error === 'string' ? `: ${body.error}` : '';
    throw new Error(`Gmail OAuth token request failed (${response.status}${code})`);
  }
  return body.access_token;
}

export async function sendGmailMessage(
  env: GmailEnv,
  message: GmailMessage,
  fetcher: Fetcher = fetch,
): Promise<{ messageId: string }> {
  if (!gmailConfigured(env)) throw new Error('Gmail email delivery is not configured');
  const token = await accessToken(env, fetcher);
  const raw = buildGmailRawMessage(message);
  const response = await fetcher(GMAIL_SEND_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ raw }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await jsonBody<SendResponse>(response);
  if (!response.ok || typeof body?.id !== 'string' || !body.id) {
    const code = typeof body?.error?.status === 'string' ? `: ${body.error.status}` : '';
    throw new Error(`Gmail send failed (${response.status}${code})`);
  }
  return { messageId: body.id };
}
