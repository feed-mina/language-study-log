'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { calendarDays, formatStart, type AgendaItem, type DaySummary } from '../schedule-utils';
import RecoveryQueue from './RecoveryQueue';
import StudyCalendar from './StudyCalendar';
import DayAgenda from './DayAgenda';
import { scheduleGet, schedulePost } from './schedule-client';
type Card = { id: string; prompt: string; answer: string; explanation: string; language: string; due: string; reviewedAt?: string | null; rating?: string | null };
type Payload = { days: DaySummary[]; agenda: AgendaItem[]; dailyMinutes: number; availableCards: Card[]; availableCount: number };
type Props = { date: string; today: string; revision: number; canEdit: boolean; onDate: (date: string) => void; onChanged: () => void; onAdd: () => void; onComplete: (id: string) => void; onUndo: (id: string) => void; onOpen: (id: string) => void };
export default function StudySchedule(props: Props) {
  const { date, today, revision, canEdit, onChanged } = props;
  const [view, setView] = useState<'week' | 'month'>('week'), [data, setData] = useState<Payload | null>(null), [loading, setLoading] = useState(true), [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [budget, setBudget] = useState(60);
  const [editing, setEditing] = useState<AgendaItem | null>(null), [editDate, setEditDate] = useState(date), [time, setTime] = useState('');
  const [cardIds, setCardIds] = useState<string[]>([]), [reviewMinutes, setReviewMinutes] = useState(10), [reviewTime, setReviewTime] = useState('');
  const [session, setSession] = useState<AgendaItem | null>(null), [cards, setCards] = useState<Card[]>([]), [reveal, setReveal] = useState(false), [sessionLoading, setSessionLoading] = useState(false);
  const receipts = useRef(new Map<string, string>()), requestRun = useRef(0), reviewDialog = useRef<HTMLDialogElement>(null);
  const days = calendarDays(date, view), from = days[0], to = days.at(-1)!;
  const reload = useCallback(() => { setRefresh(x => x + 1); onChanged(); }, [onChanged]);
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    scheduleGet<Payload>(new URLSearchParams({ date, from, to }), controller.signal).then(result => { setData(result); setBudget(result.dailyMinutes); setCardIds(old => old.filter(id => result.availableCards.some(c => c.id === id))); }).catch(error => { if (!controller.signal.aborted) { setData(null); setMessage(error.message); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [date, from, to, revision, refresh]);
  async function save(body: Record<string, unknown>) {
    if (!canEdit || busy) return false;
    setBusy(true); setMessage('');
    try { await schedulePost(body, receipts.current); setMessage('저장했습니다.'); reload(); return true; }
    catch (error) { setMessage((error as Error).message); return false; }
    finally { setBusy(false); }
  }
  async function openReview(item: AgendaItem) {
    const run = ++requestRun.current; setSession(item); setCards([]); setReveal(false); setSessionLoading(true);
    reviewDialog.current?.showModal();
    try { const result = await scheduleGet<{ cards: Card[] }>(new URLSearchParams({ session: item.id })); if (run === requestRun.current) setCards(result.cards); }
    catch (error) { setMessage((error as Error).message); }
    finally { if (run === requestRun.current) setSessionLoading(false); }
  }
  const activeCard = cards.find(c => !c.reviewedAt);
  async function rate(rating: string) {
    if (!session || !activeCard || busy) return;
    setBusy(true);
    try { const result = await schedulePost({ action: 'rate', sessionId: session.id, cardId: activeCard.id, rating }, receipts.current); setCards(old => old.map(c => c.id === activeCard.id ? { ...c, reviewedAt: new Date().toISOString(), rating, due: result.nextDue } : c)); setReveal(false); setMessage(`평가를 저장했습니다. 다음 복습: ${new Date(result.nextDue).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`); reload(); }
    catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="study-schedule">
    <StudyCalendar date={date} today={today} view={view} days={loading ? [] : data?.days ?? []} loading={loading} onDate={props.onDate} onView={setView} />
    <form className="schedule-budget" onSubmit={e => { e.preventDefault(); void save({ action: 'budget', minutes: budget }); }}><label>하루 공부 목표 <input type="number" min="10" max="600" value={budget} onChange={e => setBudget(Number(e.target.value))} required disabled={busy || loading} /> 분</label><button disabled={!canEdit || busy || loading}>목표 저장</button></form>
    {message && <p role="status" className="schedule-result">{message} {!busy && <button onClick={() => setRefresh(x => x + 1)}>새로고침</button>}</p>}
    <div className="schedule-columns"><div>{loading ? <p className="empty-state">선택한 하루를 불러오는 중…</p> : data && <DayAgenda date={date} items={data.agenda} budget={data.dailyMinutes} canEdit={canEdit} busy={busy} onAdd={props.onAdd} onComplete={props.onComplete} onUndo={props.onUndo} onOpen={props.onOpen} onReview={item => void openReview(item)} onEdit={item => { setEditing(item); setEditDate(item.date); setTime(formatStart(item.start)); }} onCancel={item => { if (window.confirm('복습 배정을 취소할까요? 이미 저장한 카드 평가는 유지됩니다.')) void save({ action: 'session-cancel', sessionId: item.id }); }} />}
      {editing && <form className="schedule-editor" onSubmit={e => { e.preventDefault(); const body = editing.type === 'review' ? { action: 'session-move', sessionId: editing.id, date: editDate, time } : editDate === editing.date ? { action: 'time', planId: editing.id, time } : { action: 'plan', command: 'reschedule', planId: editing.id, date: editDate, time }; void save(body).then(ok => { if (ok) { setEditing(null); props.onDate(editDate); } }); }}><h3>{editing.title} 날짜·시간</h3><label>날짜<input type="date" required min={editing.date < today ? editing.date : today} value={editDate} onChange={e => setEditDate(e.target.value)} disabled={busy} /></label><label>시작 시각 (비워두면 시간 미정)<input type="time" value={time} onChange={e => setTime(e.target.value)} disabled={busy} /></label><button disabled={busy}>저장</button><button disabled={busy} type="button" onClick={() => setEditing(null)}>닫기</button></form>}
    </div><div><RecoveryQueue today={today} selectedDate={date} revision={revision + refresh} canEdit={canEdit} onChanged={reload} />
      <section className="review-planner"><p className="mini-label">SPACED REVIEW</p><h2>복습 시간 배정</h2><p>현재 도래 · 미배정 {data?.availableCount ?? 0}장</p><p className="schedule-help">카드의 다음 복습일은 평가로 결정됩니다. 여기서는 공부할 시간만 정합니다. 최대 50장씩 표시하고 한 번에 20장까지 배정할 수 있어요.</p>
        <form onSubmit={e => { e.preventDefault(); void save({ action: 'session-create', date, time: reviewTime, minutes: reviewMinutes, cardIds }).then(ok => { if (ok) setCardIds([]); }); }}><div className="review-card-picker">{!loading && data?.availableCards.map(card => <label key={card.id}><input type="checkbox" checked={cardIds.includes(card.id)} disabled={busy || !canEdit || (!cardIds.includes(card.id) && cardIds.length >= 20)} onChange={e => setCardIds(old => e.target.checked ? [...old, card.id] : old.filter(id => id !== card.id))} /><span><small>{card.language}</small>{card.prompt}</span></label>)}{!loading && !data?.availableCards.length && <p>지금 배정할 복습 카드가 없습니다.</p>}</div><p>선택 {cardIds.length}장 · 배정일 {date}</p><label>예상 분량 (분)<input type="number" min="1" max="600" value={reviewMinutes} onChange={e => setReviewMinutes(Number(e.target.value))} required disabled={busy} /></label><label>시작 시각 (선택)<input type="time" value={reviewTime} onChange={e => setReviewTime(e.target.value)} disabled={busy} /></label><button disabled={!canEdit || busy || loading || !cardIds.length || date < today}>선택일에 복습 배정</button></form><p className="schedule-help">오답 다시 풀기와 복습 메모는 아래 기존 학습 영역에서 이어볼 수 있습니다.</p>
      </section></div></div>
    <dialog className="schedule-review-dialog" ref={reviewDialog} onCancel={e => { if (busy) e.preventDefault(); }}><h2>카드 복습</h2>{session && <p>{session.date} · {cards.filter(c => c.reviewedAt).length}/{cards.length}장 평가</p>}{sessionLoading ? <p>카드를 불러오는 중…</p> : activeCard ? <><h3>{activeCard.prompt}</h3><button onClick={() => setReveal(true)} disabled={busy}>답 보기</button>{reveal && <><p className="review-answer">{activeCard.answer}</p><p>{activeCard.explanation}</p><div className="schedule-toolbar">{[['again', '다시'], ['hard', '어려움'], ['good', '좋음'], ['easy', '쉬움']].map(([value, label]) => <button key={value} disabled={busy} onClick={() => void rate(value)}>{label}</button>)}</div></>}</> : <p>{cards.length ? '모든 카드 평가를 마쳤습니다.' : '표시할 카드가 없습니다.'}</p>}{!activeCard && cards.map(card => <p key={card.id}>{card.prompt} · 다음 복습 {new Date(card.due).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>)}{message && <p role="status">{message}</p>}<button disabled={busy} onClick={() => { requestRun.current++; reviewDialog.current?.close(); }}>닫기</button></dialog>
  </div>;
}
