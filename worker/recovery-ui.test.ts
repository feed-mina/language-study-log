import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

test('recovery UI keeps every lifecycle action explicit and accessibly named', () => {
  assert.match(page, /오늘로 가져오기/);
  assert.match(page, /재계획 날짜 선택/);
  assert.match(page, /aria-label={`\$\{plan\.title\} 보관`}/);
  assert.match(page, /aria-label={`\$\{plan\.title\} 복원`}/);
  assert.match(page, /recoveryRows\(recovery\.old, true\)/);
  assert.match(page, /버튼을 눌러야만 일정이 바뀝니다/);
});

test('recovery UI includes period labels and a single-column mobile summary', () => {
  assert.match(page, /최근 7일/);
  assert.match(page, /8~21일/);
  assert.match(page, /21일 초과 · 보관 추천/);
  assert.match(styles, /\.recovery-stats\s*{[^}]*grid-template-columns:\s*repeat\(3\s*,/);
  assert.match(styles, /@media \(max-width: 460px\)[\s\S]*\.recovery-stats\s*{\s*grid-template-columns:\s*1fr;/);
});

test('recovery accordion uses the requested title and starts closed', () => {
  assert.match(page, /<h2>놓친 공부 채우기<\/h2>/);
  assert.match(page, /<details className="accordion-card recovery-card"/);
  assert.doesNotMatch(page, /<details className="accordion-card recovery-card"[^>]*\sopen=/);
});
