import assert from 'node:assert/strict';
import test from 'node:test';
import { extractJson } from './types.ts';

const payload = {
  title: 'Daily English',
  summary: 'Five practical sentences',
  speakingSentence: 'Could you clarify the deadline?',
  speakingMeaning: '마감일을 명확히 알려주시겠어요?',
  items: [
    {
      prompt: 'Could you clarify the deadline?',
      answer: '마감일을 명확히 알려주시겠어요?',
      explanation: 'A polite business request.',
    },
  ],
};

test('extractJson supports the current Workers AI chat-completion shape', () => {
  const result = extractJson({
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: `\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``,
        },
      },
    ],
  });

  assert.deepEqual(result, payload);
});

test('extractJson keeps support for the legacy response shape', () => {
  assert.deepEqual(extractJson({ response: JSON.stringify(payload) }), payload);
});

test('extractJson supports JSON mode returning an object in response', () => {
  assert.deepEqual(extractJson({ response: payload }), payload);
});

test('extractJson supports text-completion choices', () => {
  assert.deepEqual(extractJson({ choices: [{ text: JSON.stringify(payload) }] }), payload);
});
