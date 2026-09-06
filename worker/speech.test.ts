import assert from 'node:assert/strict';
import test from 'node:test';

import { selectSpeechVoice, type SpeechVoiceCandidate } from '../app/speech.ts';

const voice = (name: string, lang: string, extra: Partial<SpeechVoiceCandidate> = {}): SpeechVoiceCandidate => ({ name, lang, ...extra });

test('English playback prefers an English voice over the Korean OS default', () => {
  const selected = selectSpeechVoice([
    voice('한국어 기본', 'ko-KR', { default: true, localService: true }),
    voice('English US', 'en-US'),
    voice('English UK', 'en-GB', { localService: true }),
  ], 'en-US');

  assert.equal(selected?.name, 'English US');
});

test('Japanese playback accepts ja family voices and prefers the exact locale', () => {
  const selected = selectSpeechVoice([
    voice('한국어 기본', 'ko_KR', { default: true }),
    voice('Japanese generic', 'ja'),
    voice('Japanese JP', 'ja_JP'),
  ], 'ja-JP');

  assert.equal(selected?.name, 'Japanese JP');
});

test('playback leaves voice unset when the requested language is unavailable', () => {
  assert.equal(selectSpeechVoice([voice('한국어 기본', 'ko-KR', { default: true })], 'en-US'), undefined);
  assert.equal(selectSpeechVoice([], 'ja-JP'), undefined);
});
