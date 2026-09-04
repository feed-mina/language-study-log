export type StudyOption = { label: 'A' | 'B' | 'C' | 'D'; text: string };

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
  const inline = prompt.match(/^([\s\S]*?)(?:\s+)A\.\s*([\s\S]*?)(?:\s+)B\.\s*([\s\S]*?)(?:\s+)C\.\s*([\s\S]*?)(?:\s+)D\.\s*([\s\S]+)$/);
  if (inline) {
    const question = inline[1].trim();
    const texts = inline.slice(2).map((text) => text.trim());
    const labels = ['A', 'B', 'C', 'D'] as const;
    if (question && texts.every(Boolean)) return { prompt: question, options: labels.map((label, index) => ({ label, text: texts[index] })) };
  }
  const lines = prompt.split('\n').map((line) => line.trim()).filter(Boolean);
  const firstOption = lines.findIndex((line) => /^A\.\s*\S/.test(line));
  if (firstOption < 0) return { prompt };
  const optionLines = lines.slice(firstOption).filter((line) => !/^읽기\s*:/.test(line));
  const labels = ['A', 'B', 'C', 'D'] as const;
  const options: StudyOption[] = [];
  for (const label of labels) {
    const line = optionLines.find((candidate) => candidate.startsWith(`${label}.`));
    if (!line) break;
    const text = line.slice(2).trim();
    if (!text) return { prompt };
    options.push({ label, text });
  }
  const question = lines.slice(0, firstOption).join('\n').trim();
  return question && options.length >= 2 ? { prompt: question, options } : { prompt };
}
