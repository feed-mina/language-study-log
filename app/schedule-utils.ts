export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
export function shiftDay(date: string, count: number) {
  const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + count); return d.toISOString().slice(0, 10);
}
export function calendarDays(date: string, view: 'week' | 'month') {
  const first = view === 'month' ? `${date.slice(0, 7)}-01` : date;
  const weekday = new Date(`${first}T00:00:00Z`).getUTCDay();
  const start = shiftDay(first, -((weekday + 6) % 7));
  return Array.from({ length: view === 'month' ? 42 : 7 }, (_, i) => shiftDay(start, i));
}
export function parseStart(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('시각은 HH:MM 형식으로 입력하세요.');
  const [h, m] = value.split(':').map(Number); return h * 60 + m;
}
export function formatStart(value: number | null) { return value === null ? '' : `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; }
export function kstDate(now = new Date()) { return new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10); }
export function dayEnd(date: string) { return `${shiftDay(date, 1)}T00:00:00+09:00`; }
export type AgendaItem = { id: string; date: string; title: string; category: string; minutes: number; start: number | null; status: string; type: 'plan' | 'review'; sourcePlanId: string | null; cardCount?: number; reviewedCount?: number };
export type DaySummary = { date: string; count: number; completed: number; minutes: number; reviews: number; due: number };
