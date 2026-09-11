'use client';
import { useEffect, useRef, useState } from 'react';
import { formatStart, parseStart } from '../schedule-utils';
import { scheduleGet, schedulePost } from './schedule-client';

type Item = { id: string; planDate: string; category: string; title: string; detail: string; minutes: number; status: string; archiveReason: string };
type Payload = { items: Item[]; summary: { count: number; minutes: number; oldest: string | null }; totals: { count: number; minutes: number }; nextCursor: string | null };
type Props = { today: string; selectedDate: string; revision: number; canEdit: boolean; onChanged: () => void };

export default function RecoveryQueue({ today, selectedDate, revision, canEdit, onChanged }: Props) {
  const [period, setPeriod] = useState('all'), [language, setLanguage] = useState('all'), [search, setSearch] = useState('');
  const [cursors, setCursors] = useState<string[]>(['']), [data, setData] = useState<Payload | null>(null), [selected, setSelected] = useState<Record<string, Item>>({});
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [message, setMessage] = useState(''), [refresh, setRefresh] = useState(0);
  const [target, setTarget] = useState(selectedDate < today ? today : selectedDate), [time, setTime] = useState(''), [assigning, setAssigning] = useState(false);
  const receipts = useRef(new Map<string, string>());
  const cursor = cursors.at(-1) ?? '';
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      scheduleGet<Payload>(new URLSearchParams({ mode: 'recovery', period, language, search, cursor }), controller.signal).then(result => {
        if (!result.items.length && cursor) { setCursors(['']); return; }
        setData(result); setMessage('');
      }).catch(error => { if (!controller.signal.aborted) { setData(null); setMessage(error.message); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, search ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [period, language, search, cursor, revision, refresh]);
  function filter(set: (value: string) => void, value: string) { set(value); setCursors(['']); setSelected({}); setLoading(true); }
  async function perform(command: 'reschedule' | 'archive' | 'restore', override?: Item, date = target) {
    if (!canEdit || busy) return;
    const items = override ? [override] : Object.values(selected);
    if (!items.length) return;
    let start: number | null;
    try { start = command === 'reschedule' && !override ? parseStart(time) : null; } catch (error) { setMessage((error as Error).message); return; }
    if (start !== null && start + items.reduce((s, x) => s + x.minutes, 0) > 1440) { setMessage('선택한 공부 시간이 자정을 넘습니다. 시각이나 공부 수를 바꿔 주세요.'); return; }
    setBusy(true); const failures: Record<string, Item> = {}; let success = 0; const errors: string[] = [];
    for (const item of items) {
      const itemTime = formatStart(start);
      try { await schedulePost({ action: 'plan', command, planId: item.id, ...(command === 'reschedule' ? { date, time: itemTime } : {}) }, receipts.current); success++; }
      catch (error) { failures[item.id] = item; errors.push(`${item.title}: ${(error as Error).message}`); }
      if (start !== null) start += item.minutes;
    }
    setSelected(failures); setBusy(false);
    if (!errors.length) setAssigning(false);
    setRefresh(x => x + 1); onChanged();
    // Keep partial-failure details visible independently of the refreshed query.
    setResult(`${success}개 ${command === 'archive' ? '보관' : command === 'restore' ? '복원' : '재계획'} 완료.${errors.length ? ` ${errors.length}개 실패 — 입력과 선택을 유지했습니다. ${errors.join(' / ')}` : ''}`);
  }
  const [result, setResult] = useState('');
  const selection = Object.values(selected);
  return <details className="accordion-card recovery-card">
    <summary className="accordion-summary"><div><p className="mini-label">GENTLE RECOVERY</p><h2>놓친 공부 채우기</h2><p>{data ? `${data.totals.count}개 미완료 · ${data.totals.minutes}분` : '미완료 목록'} · 한 번에 5개</p></div><span aria-hidden="true">⌄</span></summary>
    <div className="accordion-body">
      <p className="schedule-help">버튼을 눌러야만 일정이 바뀝니다. 원래 일정과 재계획 이력은 남습니다.</p>
      <div className="schedule-filters">
        <label>기간<select disabled={busy} value={period} onChange={e => filter(setPeriod, e.target.value)}><option value="all">모든 미완료</option><option value="recent">최근 7일</option><option value="medium">8~21일</option><option value="old">21일 초과 · 보관 추천</option><option value="archived">보관함</option></select></label>
        <label>언어<select disabled={busy} value={language} onChange={e => filter(setLanguage, e.target.value)}><option value="all">모든 언어</option><option value="ENGLISH">영어</option><option value="JAPANESE">일본어</option><option value="TOEIC">TOEIC</option></select></label>
        <label>제목 검색<input disabled={busy} value={search} onChange={e => filter(setSearch, e.target.value)} placeholder="찾고 싶은 공부" /></label>
      </div>
      {message && <p role="alert">{message} <button onClick={() => setRefresh(x => x + 1)}>다시 불러오기</button></p>}
      {loading ? <p role="status">목록을 불러오는 중…</p> : data && <>
        <p className="schedule-help">검색 결과 {data.summary.count}개 · {data.summary.minutes}분 {data.summary.oldest && `· 가장 오래된 날짜 ${data.summary.oldest}`}</p>
        {!data.items.length && <p className="empty-state">조건에 맞는 공부가 없습니다.</p>}
        {data.items.map(plan => <article className="queue-row" key={plan.id}>
          <input type="checkbox" disabled={busy || !canEdit} checked={!!selected[plan.id]} aria-label={`${plan.title} 선택`} onChange={e => setSelected(old => { const next = { ...old }; if (e.target.checked) next[plan.id] = plan; else delete next[plan.id]; return next; })} />
          <div className="queue-copy"><span>{plan.planDate} · {plan.category} · {plan.minutes}분</span><strong>{plan.title}</strong>{(plan.detail || plan.archiveReason) && <details><summary>내용 자세히</summary><p>{plan.detail || plan.archiveReason}</p></details>}</div>
          <div className="queue-actions">{period === 'archived' ? <button disabled={busy || !canEdit} aria-label={`${plan.title} 복원`} onClick={() => void perform('restore', plan)}>복원</button> : <><button disabled={busy || !canEdit} aria-label={`${plan.title} 오늘로 가져오기`} onClick={() => { setTime(''); void perform('reschedule', plan, today); }}>오늘로 가져오기</button><button disabled={busy || !canEdit} aria-label={`${plan.title} 재계획 날짜 선택`} onClick={() => { setSelected({ [plan.id]: plan }); setTarget(selectedDate < today ? today : selectedDate); setTime(''); setAssigning(true); }}>날짜 선택</button><button disabled={busy || !canEdit} aria-label={`${plan.title} 보관`} onClick={() => void perform('archive', plan)}>보관</button></>}</div>
        </article>)}
        <div className="schedule-toolbar"><span>{data.summary.count ? `${(cursors.length - 1) * 5 + 1}–${(cursors.length - 1) * 5 + data.items.length} / ${data.summary.count}개` : '0개'}</span><button disabled={busy || cursors.length === 1} onClick={() => setCursors(x => x.slice(0, -1))}>이전</button><button disabled={busy || !data.nextCursor} onClick={() => setCursors(x => [...x, data.nextCursor!])}>다음</button></div>
      </>}
      <div className="queue-selection"><strong>{selection.length}개 선택 · {selection.reduce((s, x) => s + x.minutes, 0)}분</strong><div className="schedule-toolbar">{period === 'archived' ? <button disabled={busy || !selection.length || !canEdit} onClick={() => void perform('restore')}>선택 복원</button> : <><button disabled={busy || !selection.length || !canEdit} onClick={() => { setTarget(selectedDate < today ? today : selectedDate); setTime(''); setAssigning(true); }}>선택 날짜 배정</button><button disabled={busy || !selection.length || !canEdit} onClick={() => void perform('archive')}>선택 보관</button></>}<button disabled={busy || !selection.length} onClick={() => setSelected({})}>선택 해제</button></div></div>
      {assigning && <form className="schedule-editor" onSubmit={e => { e.preventDefault(); void perform('reschedule'); }}><h3>재계획 날짜 선택</h3><p>여러 개를 선택하면 시작 시각부터 차례로 배정합니다. 실패한 항목은 선택 상태로 남습니다.</p><label>날짜<input type="date" min={today} required value={target} onChange={e => setTarget(e.target.value)} disabled={busy} /></label><label>시작 시각 (선택)<input type="time" value={time} onChange={e => setTime(e.target.value)} disabled={busy} /></label><button disabled={busy || !selection.length}>{busy ? '배정 중…' : '이 날짜로 재계획'}</button><button type="button" disabled={busy} onClick={() => setAssigning(false)}>닫기</button></form>}
      {result && <p role="status" className="schedule-result">{result}</p>}
    </div>
  </details>;
}
