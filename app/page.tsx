'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

type StudyPlan = { id: string; planDate: string; category: string; title: string; detail: string; minutes: number; completed: number };
type StudyLog = { id: string; studyDate: string; part: string; title: string; minutes: number; score: string; note: string; createdAt: string };
type StudyItem = { prompt: string; answer: string; explanation: string };
type StudyPayload = { title: string; summary: string; speakingSentence?: string; speakingMeaning?: string; items: StudyItem[] };
type StudyAsset = { id: string; kind: string; filename: string; contentType: string; bytes: number; url: string };
type StudyMaterial = {
  id: string;
  date: string;
  kind: 'english' | 'japanese' | 'toeic';
  title: string;
  summary: string;
  body: unknown;
  status: string;
  createdAt: string;
  assets: StudyAsset[];
};
type AuthState = 'checking' | 'guest' | 'authenticated';

const days = ['일', '월', '화', '수', '목', '금', '토'];
const categoryClass: Record<string, string> = {
  LC: 'coral',
  RC: 'green',
  VOCA: 'blue',
  TEST: 'purple',
  ENGLISH: 'blue',
  JAPANESE: 'coral',
  TOEIC: 'purple',
};
const categoryLabel: Record<string, string> = { ENGLISH: 'EN', JAPANESE: 'JP' };
const materialKind: Record<StudyMaterial['kind'], { label: string; description: string; language: string }> = {
  english: { label: '영어', description: 'English', language: 'en' },
  japanese: { label: '일본어', description: 'Japanese', language: 'ja' },
  toeic: { label: 'TOEIC', description: 'Test practice', language: 'en' },
};
const materialOrder: StudyMaterial['kind'][] = ['english', 'japanese', 'toeic'];
const materialsApiOrigin = 'https://language-study-log.evolvix.workers.dev';

function isString(value: unknown): value is string { return typeof value === 'string'; }

function readPayload(value: unknown): StudyPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (!isString(row.title) || !isString(row.summary) || !Array.isArray(row.items)) return null;
  const items = row.items.filter((item): item is StudyItem => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const candidate = item as Record<string, unknown>;
    return isString(candidate.prompt) && isString(candidate.answer) && isString(candidate.explanation);
  });
  if (items.length !== row.items.length || items.length === 0 || items.length > 12) return null;
  const speakingSentence = isString(row.speakingSentence) && row.speakingSentence ? row.speakingSentence : undefined;
  const speakingMeaning = isString(row.speakingMeaning) && row.speakingMeaning ? row.speakingMeaning : undefined;
  return { title: row.title, summary: row.summary, speakingSentence, speakingMeaning, items };
}

function readMaterials(value: unknown): StudyMaterial[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const materials = (value as Record<string, unknown>).materials;
  if (!Array.isArray(materials)) return [];
  return materials.filter((material): material is StudyMaterial => {
    if (!material || typeof material !== 'object' || Array.isArray(material)) return false;
    const row = material as Record<string, unknown>;
    if (!isString(row.id) || !isString(row.date) || !isString(row.title) || !isString(row.summary)) return false;
    if (!isString(row.status) || !isString(row.createdAt) || !materialOrder.includes(row.kind as StudyMaterial['kind'])) return false;
    if (!Array.isArray(row.assets)) return false;
    return row.assets.every((asset) => {
      if (!asset || typeof asset !== 'object' || Array.isArray(asset)) return false;
      const candidate = asset as Record<string, unknown>;
      return isString(candidate.id) && isString(candidate.kind) && isString(candidate.filename)
        && isString(candidate.contentType) && typeof candidate.bytes === 'number'
        && isString(candidate.url) && /^\/api\/assets\/[a-f0-9-]+$/i.test(candidate.url);
    });
  }) as StudyMaterial[];
}

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
  const [overduePlans, setOverduePlans] = useState<StudyPlan[]>([]);
  const [logs, setLogs] = useState<StudyLog[]>([]);
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [completedDates, setCompletedDates] = useState<string[]>([]);
  const [modal, setModal] = useState<'log' | 'plan' | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [authModal, setAuthModal] = useState(false);
  const [adminToken, setAdminToken] = useState('');
  const [authenticating, setAuthenticating] = useState(false);
  const week = useMemo(() => getWeek(selectedDate), [selectedDate]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [dashboardResult, materialsResult] = await Promise.allSettled([
        fetch(`/api/dashboard?date=${selectedDate}&start=${week[0]}&end=${week[6]}`).then(async (response) => {
          if (!response.ok) throw new Error('dashboard load failed');
          return response.json() as Promise<{ plans: StudyPlan[]; overduePlans: StudyPlan[]; logs: StudyLog[]; completedDates: string[] }>;
        }),
        fetch(`${materialsApiOrigin}/api/materials?date=${selectedDate}`).then(async (response) => {
          if (!response.ok) throw new Error('materials load failed');
          return response.json() as Promise<unknown>;
        }),
      ]);

      if (dashboardResult.status === 'fulfilled') {
        setPlans(dashboardResult.value.plans);
        setOverduePlans(dashboardResult.value.overduePlans ?? []);
        setLogs(dashboardResult.value.logs);
        setCompletedDates(dashboardResult.value.completedDates);
      } else {
        setPlans([]);
        setOverduePlans([]);
        setLogs([]);
        setCompletedDates([]);
      }

      if (materialsResult.status === 'fulfilled') {
        setMaterials(readMaterials(materialsResult.value));
      } else {
        setMaterials([]);
      }

      if (dashboardResult.status === 'rejected' && materialsResult.status === 'rejected') {
        setNotice('학습 정보와 예약 자료를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
      } else if (dashboardResult.status === 'rejected') {
        setNotice('학습 기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
      } else if (materialsResult.status === 'rejected') {
        setNotice('예약 학습 자료를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
      }
    } catch {
      setNotice('학습 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally { setLoading(false); }
  }, [selectedDate, week]);

  // The fetch updates this client-side dashboard after the selected date changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadDashboard(); }, [loadDashboard]);
  useEffect(() => {
    let active = true;
    void fetch('/api/dashboard/session', { cache: 'no-store' })
      .then(async (response) => response.ok ? response.json() as Promise<{ authenticated?: boolean }> : { authenticated: false })
      .then((result) => { if (active) setAuthState(result.authenticated ? 'authenticated' : 'guest'); })
      .catch(() => { if (active) setAuthState('guest'); });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 3200); return () => clearTimeout(timer); }, [notice]);

  const selectedLogs = logs.filter((log) => log.studyDate === selectedDate);
  const studiedThisWeek = new Set(completedDates).size;
  const weekPercent = Math.round((studiedThisWeek / 7) * 100);
  const totalMinutes = plans.reduce((sum, plan) => sum + plan.minutes, 0);
  const sortedMaterials = [...materials].sort((a, b) => materialOrder.indexOf(a.kind) - materialOrder.indexOf(b.kind));

  function requireAdmin(): boolean {
    if (authState === 'authenticated') return true;
    setAuthModal(true);
    setNotice(authState === 'checking' ? '관리자 인증 상태를 확인하고 있어요.' : '수정하려면 관리자 로그인이 필요해요.');
    return false;
  }

  function openEditor(kind: 'log' | 'plan') {
    if (requireAdmin()) setModal(kind);
  }

  function handleUnauthorized(response: Response): boolean {
    if (response.status !== 401) return false;
    setAuthState('guest');
    setModal(null);
    setAuthModal(true);
    setNotice('로그인 시간이 끝났어요. 다시 로그인해 주세요.');
    return true;
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthenticating(true);
    try {
      const response = await fetch('/api/dashboard/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: adminToken }),
      });
      if (!response.ok) throw new Error('login failed');
      setAdminToken('');
      setAuthState('authenticated');
      setAuthModal(false);
      setNotice('관리자 모드가 열렸어요. 이제 기록을 수정할 수 있어요.');
    } catch {
      setNotice('관리자 토큰이 맞지 않거나 로그인을 처리하지 못했어요.');
    } finally {
      setAuthenticating(false);
    }
  }

  async function logout() {
    await fetch('/api/dashboard/session', { method: 'DELETE' }).catch(() => undefined);
    setAuthState('guest');
    setModal(null);
    setNotice('관리자 모드를 닫았어요.');
  }

  async function submitForm(event: FormEvent<HTMLFormElement>, kind: 'log' | 'plan') {
    event.preventDefault();
    setSaving(true);
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const response = await fetch('/api/dashboard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, ...values }) });
      if (!response.ok) {
        if (handleUnauthorized(response)) return;
        throw new Error('save failed');
      }
      setModal(null);
      setNotice(kind === 'log' ? '오늘의 공부 기록을 저장했어요.' : '학습 일정을 추가했어요.');
      await loadDashboard();
    } catch { setNotice('저장하지 못했어요. 입력 내용을 확인해 주세요.'); }
    finally { setSaving(false); }
  }

  async function togglePlan(plan: StudyPlan) {
    if (!requireAdmin()) return;
    const response = await fetch('/api/dashboard', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: plan.id, completed: plan.completed ? 0 : 1 }) });
    if (response.ok) { setNotice(plan.completed ? '완료 표시를 취소했어요.' : '학습을 완료했어요!'); await loadDashboard(); }
    else if (!handleUnauthorized(response)) setNotice('완료 상태를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.');
  }

  async function reschedulePlan(plan: StudyPlan) {
    if (!requireAdmin()) return;
    const response = await fetch('/api/dashboard', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: plan.id, action: 'reschedule', planDate: selectedDate }),
    });
    if (response.ok) {
      setNotice(`${plan.title} 일정을 이 날짜로 옮겼어요.`);
      await loadDashboard();
    } else if (!handleUnauthorized(response)) setNotice('일정을 옮기지 못했어요. 잠시 후 다시 시도해 주세요.');
  }

  async function deleteLog(id: string) {
    if (!requireAdmin()) return;
    const response = await fetch(`/api/dashboard?id=${encodeURIComponent(id)}&kind=log`, { method: 'DELETE' });
    if (response.ok) { setNotice('기록을 삭제했어요.'); await loadDashboard(); }
    else if (!handleUnauthorized(response)) setNotice('기록을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }

  async function deletePlan(id: string) {
    if (!requireAdmin()) return;
    const response = await fetch(`/api/dashboard?id=${encodeURIComponent(id)}&kind=plan`, { method: 'DELETE' });
    if (response.ok) { setNotice('일정을 삭제했어요.'); await loadDashboard(); }
    else if (!handleUnauthorized(response)) setNotice('일정을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }

  return (
    <main className="app-shell">
      <nav className="topbar">
        <a className="brand" href="#top" aria-label="TOEIC Daily 홈"><span className="brand-mark">T</span><span>TOEIC Daily</span></a>
        <div className="nav-actions"><span className="streak-pill"><span>🔥</span> 이번 주 {studiedThisWeek}일</span><button className="admin-button" onClick={() => authState === 'authenticated' ? void logout() : setAuthModal(true)}>{authState === 'authenticated' ? '편집 종료' : '관리자 로그인'}</button><button className="icon-button" aria-label="오늘로 이동" onClick={() => setSelectedDate(today)}>오늘</button></div>
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

        {!loading && overduePlans.length > 0 && (
          <section className="recovery-card" aria-labelledby="recovery-title">
            <div className="recovery-intro">
              <p className="mini-label">GENTLE RECOVERY</p>
              <h2 id="recovery-title">놓친 공부, 다시 잡기</h2>
              <p>미룬 건 실패가 아니에요. 욕심내지 말고 하나만 선택한 날짜로 옮겨 보세요.</p>
            </div>
            <div className="recovery-list">
              {overduePlans.map((plan) => (
                <article className="recovery-item" key={plan.id}>
                  <div>
                    <span>{toDate(plan.planDate).getMonth() + 1}.{toDate(plan.planDate).getDate()}에 놓침 · {plan.minutes}분</span>
                    <strong>{plan.title}</strong>
                  </div>
                  <button onClick={() => void reschedulePlan(plan)}>이 날짜로 옮기기</button>
                </article>
              ))}
            </div>
          </section>
        )}

        <div className="content-grid">
          <section className="today-card" aria-labelledby="today-title">
            <div className="card-title-row">
              <div><p className="mini-label">DAILY PLAN</p><h2 id="today-title">{selectedDate === today ? '오늘의 학습' : `${toDate(selectedDate).getMonth() + 1}월 ${toDate(selectedDate).getDate()}일 학습`}</h2></div>
              <button className="time-badge add-plan" onClick={() => openEditor('plan')}>＋ 일정 추가</button>
            </div>
            {loading ? <div className="empty-state">일정을 불러오는 중...</div> : plans.length ? plans.map((plan) => (
              <article className="plan-row" key={plan.id}>
                <button className={`plan-item ${plan.completed ? 'is-complete' : ''}`} onClick={() => void togglePlan(plan)}>
                  <span className={`part-badge ${categoryClass[plan.category] ?? 'green'}`}>{plan.completed ? '✓' : categoryLabel[plan.category] ?? plan.category}</span>
                  <div><strong>{plan.title}</strong><p>{plan.detail || '세부 메모 없음'}</p></div><span className="plan-time">{plan.minutes}분</span>
                </button>
                <button className="delete-button plan-delete" onClick={() => void deletePlan(plan.id)} aria-label={`${plan.title} 일정 삭제`}>×</button>
              </article>
            )) : <div className="empty-state"><strong>아직 예정된 공부가 없어요.</strong><span>＋ 일정 추가를 눌러 오늘의 계획을 만들어 보세요.</span></div>}
            <div className="plan-footer"><span>예상 {totalMinutes}분</span><span>완료 {plans.filter((p) => p.completed).length}/{plans.length}</span></div>
            <button className="primary-button" onClick={() => openEditor('log')}><span>＋</span> 이 날짜의 공부 기록하기</button>
          </section>

          <aside className="score-card" aria-labelledby="goal-title">
            <div className="score-top"><p className="mini-label">MY GOAL</p><span>D–97</span></div><h2 id="goal-title">목표 점수</h2>
            <div className="score-numbers"><strong>850</strong><span>점</span></div><div className="score-track"><i /></div>
            <div className="score-meta"><span>최근 735점</span><strong>+115점 남음</strong></div><p className="exam-date">다음 시험 · 2026.11.28</p>
            <div className="today-summary"><strong>{selectedLogs.reduce((sum, log) => sum + log.minutes, 0)}</strong><span>분 기록됨</span><b>{selectedLogs.length}개 학습</b></div>
          </aside>
        </div>

        <section className="materials-section" aria-labelledby="materials-title">
          <div className="section-heading materials-heading">
            <div><p className="mini-label">DAILY MATERIALS</p><h2 id="materials-title">예약 학습 자료</h2></div>
            <p>{formatKorean(selectedDate)} 도착분</p>
          </div>
          {loading ? <div className="empty-state material-empty">예약 학습 자료를 불러오는 중...</div> : sortedMaterials.length ? (
            <div className="materials-grid">
              {sortedMaterials.map((material) => {
                const meta = materialKind[material.kind];
                const payload = readPayload(material.body);
                const audioAssets = material.assets.filter((asset) => asset.contentType.startsWith('audio/'));
                return (
                  <article className={`material-card ${material.kind}`} key={material.id}>
                    <header className="material-card-header">
                      <div><span className="material-kind">{meta.label}</span><small>{meta.description}</small></div>
                      <span className="material-count">{payload?.items.length ?? 0}개 학습</span>
                    </header>
                    <h3>{material.title}</h3>
                    <p className="material-summary">{material.summary}</p>

                    {payload?.speakingSentence && (
                      <div className="speaking-block">
                        <span>말하기 한 문장</span>
                        <strong lang={meta.language}>{payload.speakingSentence}</strong>
                        {payload.speakingMeaning && <p>{payload.speakingMeaning}</p>}
                      </div>
                    )}

                    {audioAssets.map((asset) => (
                      <figure className="material-audio" key={asset.id}>
                        <figcaption>듣기 자료 · {asset.filename}</figcaption>
                        <audio controls preload="none" src={new URL(asset.url, materialsApiOrigin).toString()}>오디오를 재생할 수 없는 브라우저입니다.</audio>
                      </figure>
                    ))}

                    {payload?.items.length ? (
                      <div className="material-items">
                        {payload.items.map((item, index) => (
                          <details className="material-item" key={`${material.id}-${index}`}>
                            <summary><span>{String(index + 1).padStart(2, '0')}</span><strong lang={meta.language}>{item.prompt}</strong></summary>
                            <div className="material-answer">
                              <div><span>정답</span><p>{item.answer}</p></div>
                              {item.explanation && <div><span>설명</span><p>{item.explanation}</p></div>}
                            </div>
                          </details>
                        ))}
                      </div>
                    ) : <p className="material-unavailable">상세 학습 내용은 준비 중이에요.</p>}
                  </article>
                );
              })}
            </div>
          ) : <div className="empty-state material-empty"><strong>이 날짜에 도착한 예약 학습 자료가 없어요.</strong><span>영어, 일본어, TOEIC 자료가 도착하면 여기에 모아 보여드려요.</span></div>}
        </section>

        <section className="recent-section" aria-labelledby="recent-title">
          <div className="section-heading recent-heading"><div><p className="mini-label">STUDY LOG</p><h2 id="recent-title">최근 학습 기록</h2></div><button className="text-button" onClick={() => openEditor('log')}>새 기록 ＋</button></div>
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
      {authModal && <div className="modal-backdrop" onMouseDown={(e) => { if (e.currentTarget === e.target) setAuthModal(false); }}>
        <section className="modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
          <button className="modal-close" onClick={() => setAuthModal(false)} aria-label="닫기">×</button>
          <p className="mini-label">OWNER ACCESS</p><h2 id="auth-title">관리자 로그인</h2>
          <p className="modal-copy">일정과 학습 기록을 추가·완료·이동·삭제할 때만 필요합니다. 토큰 원문은 브라우저에 저장하지 않아요.</p>
          <form onSubmit={(event) => void login(event)}>
            <label>관리자 토큰<input type="password" value={adminToken} onChange={(event) => setAdminToken(event.target.value)} autoComplete="current-password" required maxLength={1024} /></label>
            <button className="primary-button modal-submit" disabled={authenticating}>{authenticating ? '확인 중...' : '관리자 모드 열기'}</button>
          </form>
        </section>
      </div>}
      {notice && <div className="toast" role="status">{notice}</div>}
    </main>
  );
}
