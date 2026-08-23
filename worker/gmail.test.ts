import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';

import { buildGmailRawMessage, sendGmailMessage, type GmailEnv } from './gmail.ts';

test('buildGmailRawMessage creates a Gmail-compatible MIME message with an attachment', () => {
  const attachment = Uint8Array.from([0, 1, 2, 3, 254, 255]);
  const raw = buildGmailRawMessage({
    to: 'recipient@example.com',
    from: 'sender@gmail.com',
    fromName: 'Language Study Log',
    subject: '[2026-08-23] 영어 공부',
    text: '오늘의 문장입니다.',
    html: '<p>오늘의 문장입니다.</p>',
    attachments: [{
      content: attachment.buffer,
      filename: 'practice.mp3',
      type: 'audio/mpeg',
    }],
  });

  assert.match(raw, /^[A-Za-z0-9_-]+$/);
  const mime = Buffer.from(raw, 'base64url').toString('utf8');
  assert.match(mime, /From: Language Study Log <sender@gmail\.com>/);
  assert.match(mime, /To: recipient@example\.com/);
  assert.match(mime, /Content-Type: multipart\/mixed/);
  assert.match(mime, /Content-Type: text\/plain; charset=UTF-8/);
  assert.match(mime, /Content-Type: text\/html; charset=UTF-8/);
  assert.match(mime, /Content-Disposition: attachment; filename="practice\.mp3"/);
  assert.ok(mime.includes(Buffer.from(attachment).toString('base64')));
});

test('buildGmailRawMessage rejects header injection in addresses', () => {
  assert.throws(() => buildGmailRawMessage({
    to: 'recipient@example.com\r\nBcc: attacker@example.com',
    from: 'sender@gmail.com',
    fromName: 'Language Study Log',
    subject: 'Study',
    text: 'Study',
    html: '<p>Study</p>',
    attachments: [],
  }), /Invalid email address/);
});

test('sendGmailMessage refreshes OAuth and submits the MIME message', async () => {
  const env: GmailEnv = {
    GMAIL_CLIENT_ID: 'client-id',
    GMAIL_CLIENT_SECRET: 'client-secret',
    GMAIL_REFRESH_TOKEN: 'refresh-token',
    STUDY_EMAIL_TO: 'recipient@example.com',
    STUDY_EMAIL_FROM: 'sender@gmail.com',
  };
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    requests.push({ url, init });
    if (url === 'https://oauth2.googleapis.com/token') {
      return Response.json({ access_token: 'access-token' });
    }
    return Response.json({ id: 'gmail-message-id' });
  }) as typeof fetch;

  const result = await sendGmailMessage(env, {
    to: env.STUDY_EMAIL_TO!,
    from: env.STUDY_EMAIL_FROM!,
    fromName: 'Language Study Log',
    subject: 'Study',
    text: 'Study',
    html: '<p>Study</p>',
    attachments: [],
  }, fetcher);

  assert.equal(result.messageId, 'gmail-message-id');
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, 'https://oauth2.googleapis.com/token');
  assert.match(String(requests[0].init?.body), /grant_type=refresh_token/);
  assert.equal(requests[1].url, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
  const headers = new Headers(requests[1].init?.headers);
  assert.equal(headers.get('authorization'), 'Bearer access-token');
  const requestBody = JSON.parse(String(requests[1].init?.body)) as { raw?: unknown };
  assert.equal(typeof requestBody.raw, 'string');
});
