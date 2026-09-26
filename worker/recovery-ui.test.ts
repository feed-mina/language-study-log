import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../app/components/RecoveryQueue.tsx', import.meta.url), 'utf8');
const home = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const library = readFileSync(new URL('../app/components/StudyLibrary.tsx', import.meta.url), 'utf8');
const schedule = readFileSync(new URL('../app/components/StudySchedule.tsx', import.meta.url), 'utf8');

test('recovery UI keeps every lifecycle action explicit and accessibly named', () => {
  assert.match(page, /오늘로 가져오기/);
  assert.match(page, /재계획 날짜 선택/);
  assert.match(page, /aria-label={`\$\{plan\.title\} 보관`}/);
  assert.match(page, /aria-label={`\$\{plan\.title\} 복원`}/);
  assert.match(page, /value="old"/);
  assert.match(page, /버튼을 눌러야만 일정이 바뀝니다/);
});

test('recovery UI includes period labels and responsive filters', () => {
  assert.match(page, /최근 7일/);
  assert.match(page, /8~21일/);
  assert.match(page, /21일 초과 · 보관 추천/);
  assert.match(styles, /\.schedule-filters\s*{[^}]*grid-template-columns:\s*1fr 1fr/);
  assert.match(styles, /@media \(max-width: 460px\)/);
});

test('recovery accordion uses the requested title and starts closed', () => {
  assert.match(page, /<h2>놓친 공부 채우기<\/h2>/);
  assert.match(page, /<details className="accordion-card recovery-card"/);
  assert.doesNotMatch(page, /<details className="accordion-card recovery-card"[^>]*\sopen=/);
});

test('restart UI previews the batch before a separate confirmation and states the preserved scope', () => {
  assert.match(home, /변경 전 미리보기/);
  assert.match(home, /확인하고 재시작/);
  assert.match(home, /snapshot_token: restartPreview\.snapshotToken/);
  assert.match(home, /expected_backlog_count: restartPreview\.backlogCount/);
  assert.match(home, /영어 20분 \+ 일본어 20분 · TOEIC 일시정지/);
  assert.match(home, /기존 자료와 기록 유지/);
  assert.match(styles, /\.restart-panel/);
});

test('자료함 UI는 검색·언어·상태·날짜 필터와 명시적인 묶음 복원을 제공한다', () => {
  assert.match(library, /지난 학습 자료함/);
  assert.match(library, /제목·요약·문장 검색/);
  assert.match(library, /value="english"/);
  assert.match(library, /value="completed"/);
  assert.match(library, /type="date"/);
  assert.match(library, /window\.confirm/);
  assert.match(library, /batch_id: batch\.id/);
  assert.match(styles, /\.library-grid/);
});

test('복습 UI는 약한 단어와 낮은 단계를 우선한다는 근거를 표시한다', () => {
  assert.match(schedule, /약한 단어를 먼저/);
  assert.match(schedule, /card\.priorityLabel/);
  assert.match(styles, /\.review-priority\.weak/);
});
