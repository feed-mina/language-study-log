export type StudyOption = { label: 'A' | 'B' | 'C' | 'D'; text: string };
export type QuizItemSnapshot = { prompt: string; options: StudyOption[]; correctLabel: StudyOption['label']; explanation: string };
const quizLabels = ['A', 'B', 'C', 'D'] as const;

export function correctOptionLabel(answer: string): StudyOption['label'] | null {
  const match = answer.match(/^\s*(?:(?:정답|answer)\s*:\s*)?([A-D])(?=\s|[.)]|$)/i);
  return match ? match[1].toUpperCase() as StudyOption['label'] : null;
}

export function quizItemSnapshot(prompt: string, options: unknown, answer: string, explanation = ''): QuizItemSnapshot | null {
  const legacy = splitLegacyQuestion(prompt);
  const structured = Array.isArray(options) && options.length === quizLabels.length
    ? options.map((option, index) => {
      if (!option || typeof option !== 'object' || Array.isArray(option)) return null;
      const candidate = option as Record<string, unknown>;
      return candidate.label === quizLabels[index] && typeof candidate.text === 'string' && candidate.text.trim()
        ? { label: quizLabels[index], text: candidate.text.trim() }
        : null;
    })
    : [];
  const normalizedOptions = structured.length === quizLabels.length && structured.every((option): option is StudyOption => option !== null)
    ? structured
    : legacy.options;
  const correctLabel = correctOptionLabel(answer);
  if (!normalizedOptions || normalizedOptions.length !== quizLabels.length || !correctLabel) return null;
  return {
    prompt: legacy.options ? legacy.prompt : prompt.trim(),
    options: normalizedOptions,
    correctLabel,
    explanation: explanation.trim(),
  };
}

export function quizItemVersion(item: QuizItemSnapshot): string {
  return JSON.stringify(item);
}

export function quizItemSnapshotFromJson(value: string): QuizItemSnapshot | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const row = parsed as Record<string, unknown>;
    if (typeof row.prompt !== 'string' || typeof row.correctLabel !== 'string' || typeof row.explanation !== 'string') return null;
    return quizItemSnapshot(row.prompt, row.options, row.correctLabel, row.explanation);
  } catch {
    return null;
  }
}

export function quizItemFromMaterialBody(bodyJson: string, itemIndex: number): QuizItemSnapshot | null {
  if (!Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex > 20) return null;
  try {
    const payload = JSON.parse(bodyJson) as unknown;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    const items = (payload as Record<string, unknown>).items;
    if (!Array.isArray(items) || itemIndex >= items.length) return null;
    const item = items[itemIndex];
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    if (typeof row.prompt !== 'string' || typeof row.answer !== 'string') return null;

    return quizItemSnapshot(row.prompt, row.options, row.answer, typeof row.explanation === 'string' ? row.explanation : '');
  } catch {
    return null;
  }
}

export function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function kstToday(epochMilliseconds = Date.now()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(epochMilliseconds));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function toLocalDate(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

export function getWeek(value: string): string[] {
  const selected = toLocalDate(value);
  const start = new Date(selected);
  start.setDate(selected.getDate() - ((selected.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return localDateString(date);
  });
}

export function shiftDate(value: string, days: number): string {
  const date = toLocalDate(value);
  date.setDate(date.getDate() + days);
  return localDateString(date);
}

export function weekLabel(week: string[]): string {
  const start = toLocalDate(week[0]);
  const end = toLocalDate(week[6]);
  const weekOfMonth = Math.floor((start.getDate() - 1) / 7) + 1;
  const range = `${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')} ~ ${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
  return `${start.getMonth() + 1}월 ${weekOfMonth}주 (${range})`;
}

export function dDay(examDate: string, today: string): string {
  const exam = Date.parse(`${examDate}T00:00:00Z`);
  const current = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(exam) || !Number.isFinite(current)) return '';
  const difference = Math.round((exam - current) / 86_400_000);
  if (difference === 0) return 'D-DAY';
  return difference > 0 ? `D-${difference}` : `D+${Math.abs(difference)}`;
}

export function splitLegacyQuestion(prompt: string): { prompt: string; options?: StudyOption[] } {
  const match = prompt.match(/^([\s\S]*?)(?:\s+)A\.\s*([\s\S]*?)(?:\s+)B\.\s*([\s\S]*?)(?:\s+)C\.\s*([\s\S]*?)(?:\s+)D\.\s*([\s\S]+)$/);
  const labels = ['A', 'B', 'C', 'D'] as const;
  if (match) {
    const question = match[1].trim();
    const texts = match.slice(2).map((text) => text.trim());
    if (question && !texts.some((text) => !text)) return { prompt: question, options: labels.map((label, index) => ({ label, text: texts[index] })) };
  }

  const circled = prompt.match(/^([\s\S]*?)(?:\s*)①\s*([\s\S]*?)(?:\s*)②\s*([\s\S]*?)(?:(?:\s*)③\s*([\s\S]*?))?(?:(?:\s*)④\s*([\s\S]*?))?$/);
  if (!circled) return { prompt };
  const question = circled[1].trim();
  const texts = circled.slice(2).filter((text): text is string => typeof text === 'string').map((text) => text.trim());
  if (!question || texts.length < 2 || texts.some((text) => !text)) return { prompt };
  return { prompt: question, options: texts.map((text, index) => ({ label: labels[index], text })) };
}
