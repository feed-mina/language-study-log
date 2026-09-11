import { calendarDays, shiftDay, type DaySummary } from '../schedule-utils';
type Props = { date: string; today: string; view: 'week' | 'month'; days: DaySummary[]; loading: boolean; onDate: (date: string) => void; onView: (view: 'week' | 'month') => void };
export default function StudyCalendar({ date, today, view, days, loading, onDate, onView }: Props) {
  function navigate(n: number) {
    if (view === 'week') onDate(shiftDay(date, n * 7));
    else { const d = new Date(`${date.slice(0, 7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); onDate(d.toISOString().slice(0, 10)); }
  }
  return <section className="study-calendar" aria-label="학습 달력"><div className="schedule-heading"><div><p className="mini-label">MY STUDY RHYTHM</p><h2>나의 학습 달력</h2><p>{date.slice(0, 7)} · 날짜를 선택하면 하루 공부가 보입니다.</p></div><div className="schedule-toolbar"><button aria-pressed={view === 'week'} onClick={() => onView('week')}>주간</button><button aria-pressed={view === 'month'} onClick={() => onView('month')}>월간</button></div></div>
    <div className="schedule-toolbar"><button onClick={() => navigate(-1)} aria-label="이전 기간">←</button><button onClick={() => onDate(today)}>오늘</button><button onClick={() => navigate(1)} aria-label="다음 기간">→</button><label>날짜<input aria-label="달력 날짜" type="date" value={date} onChange={e => { if (e.target.value) onDate(e.target.value); }} /></label></div>
    <p className="schedule-help">링은 일정 항목 완료율 · 학습과 복습 시간은 별도 표시 · 복습 도래 건수는 카드 기준{loading ? ' · 불러오는 중…' : ''}</p>
    <div className="study-calendar-grid">{['월', '화', '수', '목', '금', '토', '일'].map(x => <span className="study-weekday" key={x}>{x}</span>)}{calendarDays(date, view).map(day => {
      const summary = days.find(x => x.date === day), count = summary?.count ?? 0, done = summary?.completed ?? 0, percent = count ? done / count * 100 : 0;
      return <button key={day} className={`study-day ${day === date ? 'selected' : ''} ${day.slice(0, 7) !== date.slice(0, 7) ? 'outside' : ''}`} aria-pressed={day === date} aria-label={`${day}, 일정 ${count}개, 완료 ${done}개`} onClick={() => onDate(day)}><b>{Number(day.slice(8))}{day === today && <small> 오늘</small>}</b><span className="study-ring" style={{ background: `conic-gradient(var(--green) ${percent}%, #e2eae5 0)` }}><i>{loading ? '…' : `${done}/${count}`}</i></span><small>{summary?.minutes ?? 0}분</small><small>복습 {summary?.reviews ?? 0}회</small>{!!summary?.due && <small className="due-label">도래 {summary.due}장</small>}</button>;
    })}</div>
  </section>;
}
