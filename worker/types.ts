export const CONTENT_KINDS = ['english', 'japanese', 'toeic'] as const;

export type ContentKind = (typeof CONTENT_KINDS)[number];

export type WorkerEnv = Env & {
  ASSETS?: {
    fetch(request: Request): Promise<Response> | Response;
  };
};

export interface StudyItem {
  prompt: string;
  options?: StudyOption[];
  answer: string;
  explanation: string;
}

export interface StudyOption {
  label: 'A' | 'B' | 'C' | 'D';
  text: string;
}

export interface StudyPayload {
  title: string;
  summary: string;
  speakingSentence?: string;
  speakingMeaning?: string;
  items: StudyItem[];
}

export interface ContentRow {
  id: string;
  content_date: string;
  kind: ContentKind;
  title: string;
  summary: string;
  body_json: string;
  model: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface AssetRow {
  id: string;
  content_id: string | null;
  kind: string;
  r2_key: string;
  filename: string;
  content_type: string;
  bytes: number;
  created_at: string;
}

export interface StudyCardRow {
  id: string;
  content_id: string | null;
  language: string;
  category: string;
  prompt: string;
  answer: string;
  explanation: string;
  options_json: string;
  source: string;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: string | null;
  created_at: string;
  updated_at: string;
}

export function isContentKind(value: unknown): value is ContentKind {
  return typeof value === 'string' && CONTENT_KINDS.includes(value as ContentKind);
}

export function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function kstDate(epochMilliseconds = Date.now()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(epochMilliseconds));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function kindFromCron(cron: string): ContentKind | null {
  if (cron === '30 21 * * *') return 'english';
  if (cron === '0 23 * * *') return 'japanese';
  if (cron === '0 9 * * mon-sat') return 'toeic';
  return null;
}

function boundedText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const;

export function splitLegacyOptions(prompt: string): { prompt: string; options?: StudyOption[] } {
  const match = prompt.match(/^([\s\S]*?)(?:\s+)A\.\s*([\s\S]*?)(?:\s+)B\.\s*([\s\S]*?)(?:\s+)C\.\s*([\s\S]*?)(?:\s+)D\.\s*([\s\S]+)$/);
  if (!match) return { prompt };
  const question = match[1].trim();
  const optionTexts = match.slice(2).map((part) => part.trim());
  if (!question || optionTexts.some((part) => !part)) return { prompt };
  return {
    prompt: question,
    options: OPTION_LABELS.map((label, index) => ({ label, text: optionTexts[index] })),
  };
}

function asOptions(value: unknown): StudyOption[] | undefined {
  if (!Array.isArray(value) || value.length !== 4) return undefined;
  const options = value.map((option, index) => {
    if (!option || typeof option !== 'object' || Array.isArray(option)) return null;
    const row = option as Record<string, unknown>;
    const label = boundedText(row.label, 1);
    const text = boundedText(row.text, 240);
    if (label !== OPTION_LABELS[index] || !text) return null;
    return { label: OPTION_LABELS[index], text };
  });
  return options.every((option): option is StudyOption => option !== null) ? options : undefined;
}

function asItem(value: unknown): StudyItem | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const rawPrompt = boundedText(row.prompt, 1000);
  const answer = boundedText(row.answer, 1000);
  const explanation = boundedText(row.explanation, 1000);
  if (!rawPrompt || !answer) return null;
  const structured = splitLegacyOptions(rawPrompt);
  const options = asOptions(row.options) ?? structured.options;
  return { prompt: options ? structured.prompt : rawPrompt, ...(options ? { options } : {}), answer, explanation };
}

export function parseStudyPayload(value: unknown): StudyPayload {
  if (!value || typeof value !== 'object') throw new Error('AI response is not an object');
  const row = value as Record<string, unknown>;
  const title = boundedText(row.title, 120);
  const summary = boundedText(row.summary, 500);
  const items = Array.isArray(row.items)
    ? row.items.map(asItem).filter((item): item is StudyItem => item !== null).slice(0, 12)
    : [];
  if (!title || !summary || items.length === 0) throw new Error('AI response is missing required study content');
  const speakingSentence = boundedText(row.speakingSentence, 300) || undefined;
  const speakingMeaning = boundedText(row.speakingMeaning, 300) || undefined;
  return { title, summary, speakingSentence, speakingMeaning, items };
}

export function extractJson(value: unknown): StudyPayload {
  let candidate: unknown = value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.response === 'string' || (record.response && typeof record.response === 'object')) {
      candidate = record.response;
    } else if (Array.isArray(record.choices)) {
      for (const choice of record.choices) {
        if (!choice || typeof choice !== 'object') continue;
        const choiceRecord = choice as Record<string, unknown>;
        const message = choiceRecord.message;
        if (message && typeof message === 'object') {
          const content = (message as Record<string, unknown>).content;
          if (typeof content === 'string') {
            candidate = content;
            break;
          }
        }
        if (typeof choiceRecord.text === 'string') {
          candidate = choiceRecord.text;
          break;
        }
      }
    }
  }
  if (typeof candidate === 'string') {
    const cleaned = candidate.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    candidate = JSON.parse(cleaned) as unknown;
  }
  return parseStudyPayload(candidate);
}
