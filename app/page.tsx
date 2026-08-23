'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

type StudyPlan = { id: string; planDate: string; category: string; title: string; detail: string; minutes: number; completed: number };
type StudyLog = { id: string; studyDate: string; part: string; title: string; minutes: number; score: string; note: string; createdAt: string };

const days = ['일', '월', '화', '수', '목', '금', '토'];
const categoryClass: Record<string, string> = { LC: 'coral', RC: 'green', VOCA: 'blue', TEST: 'purple' };

function localDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toDate(value: string) { return new Date(`${value}T12:00:00`); }
function formatKorean(value: string) { const d = toDate(value); return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${days[d.getDay()]}요일`; }

function getWeek(value: string) {
  const selected = toDate(value);
  const start = new Date(selected);
  start.setDate(selected.getDate() - ((selected.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return localDateString(date); });
}

export default function Home() {
  const today = useMemo(() => localDateString(), []);
  const [selectedDate, setSelectedDate] = useState(today);
  const [plans, setPlans] = useState<StudyPlan[]>([]);
  const [logs, setLogs] = useState<StudyLog[]>([]);
  const [completedDates, setCompletedDates] = useState<string[]>([]);
  const [modal, setModal] = useState<'log' | 'plan' | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const week = useMemo(() => getWeek(selectedDate), [selectedDate]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/dashboard?date=${selectedDate}&start=${week[0]}&end=${week[6]}`);
      if (!response.ok) throw new Error('load failed');
      const data = await response.json() as { plans: StudyPlan[]; logs: StudyLog[]; completedDates: string[] };
      setPlans(data.plans);
      setLogs(data.logs);
      setCompletedDates(data.completedDates);
    } catch {
      setNotice('기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally { setLoading(false); }
  }, [selectedDate, week]);

  // The fetch updates this client-side dashboard after the selected date changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadDashboard(); }, [loadDashboard]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 3200); return () => clearTimeout(timer); }, [notice]);

  const selectedLogs = logs.filter((log) => log.studyDate === selectedDate);
  const studiedThisWeek = new Set(completedDates).size;
  const weekPercent = Math.round((studiedThisWeek / 7) * 100);
  const totalMinutes = plans.reduce((sum, plan) => sum + plan.minutes, 0);

  async function submitForm(event: FormEvent<HTMLFormElement>, kind: 'log' | 'plan') {
    event.preventDefault();
    setSaving(true);
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const response = await fetch('/api/dashboard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, ...values }) });
      if (!response.ok) throw new Error('save failed');
      setModal(null);
      setNotice(kind === 'log' ? '오늘의 공부 기록을 저장했어요.' : '학습 일정을 추가했어요.');
      await loadDashboard();
    } catch { setNotice('저장하지 못했어요. 입력 내용을 확인해 주세요.'); }
    finally { setSaving(false); }
  }

  async function togglePlan(plan: StudyPlan) {
    const response = await fetch('/api/dashboard', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: plan.id, completed: plan.completed ? 0 : 1 }) });
    if (response.ok) { setNotice(plan.completed ? '완료 표시를 취소했어요.' : '학습을 완료했어요!'); await loadDashboard(); }
  }

  async function deleteLog(id: string) {
    const response = await fetch(`/api/dashboard?id=${encodeURIComponent(id)}&kind=log`, { method: 'DELETE' });
    if (response.ok) { setNotice('기록을 삭제했어요.'); await loadDashboard(); }
  }

  return (
    <main className="app-shell">
      <nav className="topbar">
        <a className="brand" href="#top" aria-label="TOEIC Daily 홈"><span className="brand-mark">T</span><span>TOEIC Daily</span></a>
        <div className="nav-actions"><span className="streak-pill"><span>🔥</span> 이번 주 {studiedThisWeek}일</span><button className="icon-button" aria-label="오늘로 이동" onClick={() => setSelectedDate(today)}>오늘</button></div>
      </nav>

      <div className="dashboard" id="top">
        <header className="hero-row">
          <div><p className="eyebrow">{formatKorean(selectedDate)}</p><h1>오늘도 한 걸음, <span>목표 점수까지.</span></h1><p className="hero-copy">계획을 확인하고 공부한 내용을 차곡차곡 기록해 보세요.</p></div>
          <div className="goal-ring" style={{ background: `conic-gradient(var(--coral) 0 ${weekPercent}%, #e6e2d9 ${weekPercent}% 100%)` }} aria-label={`이번 주 목표 ${weekPercent}% 달성`}><div><strong>{weekPercent}</strong><span>%</span><small>이번 주</small></div></div>
        </header>

        <section className="week-card" aria-labelledby="week-title">
          <div className="section-heading">
            <div><p className="mini-label">WEEKLY VIEW</p><h2 id="week-title">{toDate(week[0]).getMonth() + 1}월 {toDate(week[0]).getDate()}일 – {toDate(week[6]).getMonth() + 1}월 {toDate(week[6]).getDate()}일</h2></div>
            <p><strong>{studiedThisWeek}</strong> / 7일 공부 완료</p>
          </div>
          <div className="week-grid">
            {week.map((date) => { const d = toDate(date); const done = completedDates.includes(date); return (
              <button key={date} onClick={() => setSelectedDate(date)} className={`day-cell ${done ? 'done' : ''} ${date === selectedDate ? 'today' : ''}`} aria-current={date === selectedDate ? 'date' : undefined}>
                <span>{days[d.getDay()]}</span><strong>{d.getDate()}</strong><i>{done ? '✓' : date === today ? '오늘' : '—'}</i>
              </button>
            ); })}
          </div>
        </section>

        <div className="content-grid">
          <section className="today-card" aria-labelledby="today-title">
            <div className="card-title-row">
              <div><p className="mini-label">DAILY PLAN</p><h2 id="today-title">{selectedDate === today ? '오늘의 학습' : `${toDate(selectedDate).getMonth() + 1}월 ${toDate(selectedDate).getDate()}일 학습`}</h2></div>
              <button className="time-badge add-plan" onClick={() => setModal('plan')}>＋ 일정 추가</button>
            </div>
            {loading ? <div className="empty-state">일정을 불러오는 중...</div> : plans.length ? plans.map((plan) => (
              <button className={`plan-item ${plan.completed ? 'is-complete' : ''}`} key={plan.id} onClick={() => void togglePlan(plan)}>
                <span className={`part-badge ${categoryClass[plan.category] ?? 'green'}`}>{plan.completed ? '✓' : plan.category}</span>
                <div><strong>{plan.title}</strong><p>{plan.detail || '세부 메모 없음'}</p></div><span className="plan-time">{plan.minutes}분</span>
              </button>
            )) : <div className="empty-state"><strong>아직 예정된 공부가 없어요.</strong><span>＋ 일정 추가를 눌러 오늘의 계획을 만들어 보세요.</span></div>}
            <div className="plan-footer"><span>예상 {totalMinutes}분</span><span>완료 {plans.filter((p) => p.completed).length}/{plans.length}</span></div>
            <button className="primary-button" onClick={() => setModal('log')}><span>＋</span> 이 날짜의 공부 기록하기</button>
          </section>

          <aside className="score-card" aria-labelledby="goal-title">
            <div className="score-top"><p className="mini-label">MY GOAL</p><span>D–97</span></div><h2 id="goal-title">목표 점수</h2>
            <div className="score-numbers"><strong>850</strong><span>점</span></div><div className="score-track"><i /></div>
            <div className="score-meta"><span>최근 735점</span><strong>+115점 남음</strong></div><p className="exam-date">다음 시험 · 2026.11.28</p>
            <div className="today-summary"><strong>{selectedLogs.reduce((sum, log) => sum + log.minutes, 0)}</strong><span>분 기록됨</span><b>{selectedLogs.length}개 학습</b></div>
          </aside>
        </div>

        <section className="recent-section" aria-labelledby="recent-title">
          <div className="section-heading recent-heading"><div><p className="mini-label">STUDY LOG</p><h2 id="recent-title">최근 학습 기록</h2></div><button className="text-button" onClick={() => setModal('log')}>새 기록 ＋</button></div>
          <div className="log-list">
            {loading ? <div className="empty-state compact">기록을 불러오는 중...</div> : logs.length ? logs.map((log) => (
              <article className="log-row" key={log.id}>
                <time dateTime={log.studyDate}>{toDate(log.studyDate).getMonth() + 1}.{toDate(log.studyDate).getDate()}</time><span className={`log-dot ${categoryClass[log.part] ?? 'mint'}`} /><span className="log-part">{log.part}</span><div className="log-main"><strong>{log.title}</strong>{log.note && <small>{log.note}</small>}</div><span>{log.minutes}분</span><b>{log.score || '완료'}</b><button className="delete-button" onClick={() => void deleteLog(log.id)} aria-label={`${log.title} 삭제`}>×</button>
              </article>
            )) : <div className="empty-state compact"><strong>아직 학습 기록이 없어요.</strong><span>첫 공부를 기록하면 여기에 쌓여요.</span></div>}
          </div>
        </section>
      </div>

      {modal && <div className="modal-backdrop" onMouseDown={(e) => { if (e.currentTarget === e.target) setModal(null); }}>
        <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <button className="modal-close" onClick={() => setModal(null)} aria-label="닫기">×</button>
          <p className="mini-label">{modal === 'log' ? 'STUDY LOG' : 'DAILY PLAN'}</p><h2 id="modal-title">{modal === 'log' ? '공부한 내용 기록하기' : '학습 일정 추가하기'}</h2>
          <p className="modal-copy">작은 기록이 쌓일수록 다음 공부가 더 선명해져요.</p>
          {modal === 'log' ? <form onSubmit={(e) => void submitForm(e, 'log')}>
            <div className="form-grid"><label>공부한 날짜<input name="studyDate" type="date" defaultValue={selectedDate} required /></label><label>파트<select name="part" defaultValue="LC"><option>LC</option><option>RC</option><option>VOCA</option><option>TEST</option></select></label></div>
            <label>공부한 내용<input name="title" placeholder="예: Part 2 오답 다시 듣기" required maxLength={80} /></label>
            <div className="form-grid"><label>공부 시간<input name="minutes" type="number" min="1" max="600" defaultValue="40" required /></label><label>점수 또는 성과<input name="score" placeholder="예: 22/25, 85%" maxLength={30} /></label></div>
            <label>한 줄 메모<textarea name="note" placeholder="어려웠던 점이나 내일 기억할 것" maxLength={300} /></label><button className="primary-button modal-submit" disabled={saving}>{saving ? '저장 중...' : '기록 저장하기'}</button>
          </form> : <form onSubmit={(e) => void submitForm(e, 'plan')}>
            <div className="form-grid"><label>예정 날짜<input name="planDate" type="date" defaultValue={selectedDate} required /></label><label>분류<select name="category" defaultValue="LC"><option>LC</option><option>RC</option><option>VOCA</option><option>TEST</option></select></label></div>
            <label>학습 제목<input name="title" placeholder="예: Part 5 관계사 핵심 정리" required maxLength={80} /></label><label>세부 계획<input name="detail" placeholder="예: 개념 복습 + 실전 문제 20개" maxLength={120} /></label><label>예상 시간 (분)<input name="minutes" type="number" min="1" max="600" defaultValue="40" required /></label><button className="primary-button modal-submit" disabled={saving}>{saving ? '저장 중...' : '일정 추가하기'}</button>
          </form>}
        </section>
      </div>}
      {notice && <div className="toast" role="status">{notice}</div>}
    </main>
  );
}
