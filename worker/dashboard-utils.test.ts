import assert from 'node:assert/strict';
import test from 'node:test';

import { dDay, getWeek, kstToday, shiftDate, splitLegacyQuestion, weekLabel } from '../app/dashboard-utils.ts';

test('week helpers use Monday through Sunday at month boundaries', () => {
  const week = getWeek('2026-08-30');
  assert.deepEqual(week, ['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30']);
  assert.equal(weekLabel(week), '8월 4주 (08-24 ~ 08-30)');
  assert.equal(shiftDate(week[0], 7), '2026-08-31');
});

test('D-day is derived from saved dates instead of a fixed number', () => {
  assert.equal(dDay('2026-11-28', '2026-08-30'), 'D-90');
  assert.equal(dDay('2026-08-30', '2026-08-30'), 'D-DAY');
  assert.equal(dDay('2026-08-29', '2026-08-30'), 'D+1');
});

test('today uses Asia/Seoul even near the UTC date boundary', () => {
  assert.equal(kstToday(Date.UTC(2026, 7, 29, 16, 0, 0)), '2026-08-30');
});

test('legacy TOEIC prompts are split into a question and four options', () => {
  const item = splitLegacyQuestion('The team has worked _____ dawn. A. since B. for C. by D. during');
  assert.equal(item.prompt, 'The team has worked _____ dawn.');
  assert.deepEqual(item.options, [
    { label: 'A', text: 'since' },
    { label: 'B', text: 'for' },
    { label: 'C', text: 'by' },
    { label: 'D', text: 'during' },
  ]);
});
