import assert from 'node:assert/strict';
import test from 'node:test';

import { sendTelegramStudy, splitTelegramText, telegramConfigured, type TelegramEnv } from './telegram.ts';

test('telegramConfigured requires both private values', () => {
  assert.equal(telegramConfigured({}), false);
  assert.equal(telegramConfigured({ TELEGRAM_BOT_TOKEN: 'token' }), false);
  assert.equal(telegramConfigured({ TELEGRAM_BOT_TOKEN: 'token', TELEGRAM_CHAT_ID: '123' }), true);
});

test('splitTelegramText keeps every chunk within the Telegram limit', () => {
  const text = Array.from({ length: 120 }, (_, index) => `${index + 1}. 업무 표현을 자연스럽게 연습합니다.`).join('\n');
  const chunks = splitTelegramText(text, 300);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 300));
  assert.equal(chunks.join('\n'), text);
});

test('sendTelegramStudy uploads MP3 and sends text with a site button', async () => {
  const env: TelegramEnv = { TELEGRAM_BOT_TOKEN: 'bot-token', TELEGRAM_CHAT_ID: '123456' };
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  let nextId = 40;
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: input.toString(), init });
    nextId += 1;
    return Response.json({ ok: true, result: { message_id: nextId } });
  }) as typeof fetch;

  const result = await sendTelegramStudy(env, {
    text: '오늘의 영어 문장입니다.',
    siteUrl: 'https://example.com/study',
    audio: {
      content: Uint8Array.from([0, 1, 2, 3]).buffer,
      filename: 'practice.mp3',
      type: 'audio/mpeg',
      caption: '오늘의 한 문장',
    },
  }, fetcher);

  assert.deepEqual(result.messageIds, ['41', '42']);
  assert.match(requests[0].url, /\/botbot-token\/sendAudio$/);
  assert.ok(requests[0].init?.body instanceof FormData);
  const audioBody = requests[0].init?.body as FormData;
  assert.equal(audioBody.get('chat_id'), '123456');
  assert.ok(audioBody.get('audio') instanceof Blob);

  assert.match(requests[1].url, /\/botbot-token\/sendMessage$/);
  const messageBody = JSON.parse(String(requests[1].init?.body)) as Record<string, unknown>;
  assert.equal(messageBody.chat_id, '123456');
  assert.deepEqual(messageBody.reply_markup, {
    inline_keyboard: [[{ text: '오늘 학습 기록하기', url: 'https://example.com/study' }]],
  });
});

test('Telegram failures do not expose the bot token', async () => {
  const token = 'sensitive-bot-token';
  const fetcher = (async () => Response.json({ ok: false, error_code: 403, description: 'Forbidden' }, { status: 403 })) as typeof fetch;
  await assert.rejects(
    sendTelegramStudy({ TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: '123' }, { text: 'study' }, fetcher),
    (error: unknown) => error instanceof Error && !error.message.includes(token) && /HTTP 403, code 403/.test(error.message),
  );
});
