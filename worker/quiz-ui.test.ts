import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

test('TOEIC choices are buttons with immediate correct and wrong feedback', () => {
  assert.match(page, /material\.kind === 'toeic'/);
  assert.match(page, /onClick=\{\(\) => void chooseQuizOption\(material, item, index, option\.label\)\}/);
  assert.match(page, /맞았습니다\./);
  assert.match(page, /틀렸습니다\. 정답은 \$\{correctLabel\}입니다\./);
  assert.match(page, /quizAnswer\?\.saved &&/);
  assert.match(page, /role="radiogroup"/);
  assert.match(page, /role="radio"/);
  assert.match(page, /저장 다시 시도/);
  assert.match(page, /await loadDashboard\(true\)/);
  assert.match(page, /resultLabel = revealed && answer \? '정답' : revealed && chosen \? '틀림'/);
  assert.match(styles, /\.quiz-options button\.is-correct/);
  assert.match(styles, /\.quiz-options button\.is-wrong/);
});

test('the wrong-answer notebook supports retrying and resolving saved mistakes', () => {
  assert.match(page, /<h2 id="mistake-title">TOEIC 오답노트<\/h2>/);
  assert.match(page, /onClick=\{\(\) => void chooseMistakeOption\(mistake, option\.label\)\}/);
  assert.match(page, /onClick=\{\(\) => retryMistake\(mistake\)\}/);
  assert.match(page, />다시 풀기<\/button>/);
  assert.match(page, /오답노트에서 해결 처리했어요/);
  assert.match(styles, /@media \(max-width: 460px\)[\s\S]*\.quiz-options button, \.mistake-actions button, \.quiz-result-actions button \{ min-height: 48px; \}/);
  assert.match(styles, /\.mistake-card > summary:focus-visible/);
  assert.match(styles, /\.mistake-section \{ --material-accent: #8f382b; --material-soft: #fff1ee;/);
  assert.match(styles, /\.quiz-options button:not\(:disabled\):focus-visible \{[^}]*outline: 3px solid var\(--material-accent\)/);
  assert.match(styles, /@media \(max-width: 760px\) \{[\s\S]*\.content-grid \{ grid-template-columns: 1fr; \}/);
});
