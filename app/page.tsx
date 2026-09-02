'use client';

import Image from 'next/image';
import { FormEvent, KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useState } from 'react';

import { dDay, getWeek, kstToday, shiftDate, splitLegacyQuestion, toLocalDate, weekLabel, type StudyOption } from './dashboard-utils';

type StudyPlan = { id: string; planDate: string; category: string; title: string; detail: string; minutes: number; completed: number; sourcePlanId?: string | null };
type StudyLog = { id: string; studyDate: string; part: string; title: string; minutes: number; score: string; note: string; sourceType: string; sourceId?: string | null; sourceLabel: string; confusedItems: string; createdAt: string };
type StudyItem = { prompt: string; options?: StudyOption[]; answer: string; explanation: string };
type StudyPayload = { title: string; summary: string; speakingSentence?: string; speakingMeaning?: string; items: StudyItem[] };
type StudyAsset = { id: string; kind: string; filename: string; contentType: string; bytes: number; url: string };
type StudyMaterial = { id: string; date: string; kind: 'english' | 'japanese' | 'toeic'; title: string; summary: string; body: unknown; status: string; createdAt: string; assets: StudyAsset[] };
type Goal = { targetScore: number; examDate: string; updatedAt: string };
type ToeicScore = { score: number; scoreDate: string; scoreType: string; source: string };
type ReviewNote = { title: string; studyDate: string; note: string; confusedItems: string };
type QuizMistake = { id: string; materialId: string; itemIndex: number; selectedLabel: string; correctLabel: string; prompt: string; materialTitle: string; materialKind: string; createdAt: string };
type DashboardPayload = { plans: StudyPlan[]; overduePlans: StudyPlan[]; logs: StudyLog[]; completedDates: string[]; legacyLogsCount: number; goal: Goal | null; latestScore: ToeicScore | null; reviewNotes: ReviewNote[]; quizMistakes: QuizMistake[] };
type AuthState = 'checking' | 'guest' | 'authenticated';
type Editor = 'external-log' | 'plan' | 'goal' | null;
type CompletionTarget = { type: 'plan' | 'material'; id: string; title: string; part: string; minutes: number; date: string };

const days = ['일', '월', '화', '수', '목', '금', '토'];
const weekDays = ['월', '화', '수', '목', '금', '토', '일'];
const categoryClass: Record<string, string> = { LC: 'coral', RC: 'green', VOCA: 'blue', TEST: 'purple', ENGLISH: 'blue', JAPANESE: 'coral', TOEIC: 'purple' };
const categoryLabel: Record<string, string> = { ENGLISH: 'EN', JAPANESE: 'JP' };
const sourceLabels: Record<string, string> = { plan: '일정 완료', material: '예약 자료 완료', external: '사이트 밖 학습' };
const scoreTypeLabels: Record<string, string> = { official: '공식 TOEIC', mock: '모의고사', practice: '연습 점수' };
const materialKind: Record<StudyMaterial['kind'], { label: string; description: string; language: string; part: string; minutes: number }> = {
  english: { label: '영어', description: 'English', language: 'en', part: 'ENGLISH', minutes: 20 },
  japanese: { label: '일본어', description: 'Japanese', language: 'ja', part: 'JAPANESE', minutes: 20 },
  toeic: { label: 'TOEIC', description: 'Test practice', language: 'en', part: 'TOEIC', minutes: 45 },
};
const materialOrder: StudyMaterial['kind'][] = ['english', 'japanese', 'toeic'];

function isString(value: unknown): value is string { return typeof value === 'string'; }

function readOptions(value: unknown): StudyOption[] | undefined {
  if (!Array.isArray(value) || value.length < 2 || value.length > 4) return undefined;
  const labels = ['A', 'B', 'C', 'D'] as const;
  const result = value.map((option, index) => {
    if (!option || typeof option !== 'object' || Array.isArray(option)) return null;
    const row = option as Record<string, unknown>;
    return row.label === labels[index] && isString(row.text) && row.text.trim() ? { label: labels[index], text: row.text.trim() } : null;
  });
  return result.every((option): option is StudyOption => option !== null) ? result : undefined;
}

function readPayload(value: unknown): StudyPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (!isString(row.title) || !isString(row.summary) || !Array.isArray(row.items)) return null;
  const items = row.items.map((item): StudyItem | null => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const candidate = item as Record<string, unknown>;
    if (!isString(candidate.prompt) || !isString(candidate.answer) || !isString(candidate.explanation)) return null;
    const legacy = splitLegacyQuestion(candidate.prompt);
    const options = readOptions(candidate.options) ?? legacy.options;
    return { prompt: options ? legacy.prompt : candidate.prompt, ...(options ? { options } : {}), answer: candidate.answer, explanation: candidate.explanation };
  }).filter((item): item is StudyItem => item !== null);
  if (items.length !== row.items.length || items.length === 0 || items.length > 12) return null;
  return {
    title: row.title, summary: row.summary,
    speakingSentence: isString(row.speakingSentence) && row.speakingSentence ? row.speakingSentence : undefined,
    speakingMeaning: isString(row.speakingMeaning) && row.speakingMeaning ? row.speakingMeaning : undefined,
    items,
  };
}

function readMaterials(value: unknown): StudyMaterial[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const materials = (value as Record<string, unknown>).materials;
  if (!Array.isArray(materials)) return [];
  return materials.filter((material): material is StudyMaterial => {
    if (!material || typeof material !== 'object' || Array.isArray(material)) return false;
    const row = material as Record<string, unknown>;
    return isString(row.id) && isString(row.date) && isString(row.title) && isString(row.summary)
      && isString(row.status) && isString(row.createdAt) && materialOrder.includes(row.kind as StudyMaterial['kind']) && Array.isArray(row.assets);
  }) as StudyMaterial[];
}

function formatKorean(value: string) { const date = toLocalDate(value); return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 ${days[date.getDay()]}요일`; }
function formatShort(value: string) { const date = toLocalDate(value); return `${date.getMonth() + 1}월 ${date.getDate()}일`; }
function formatCreated(value: string) { return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
function validDashboardDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(toLocalDate(value).valueOf()); }

function Marker() { return <span className="accordion-marker" aria-hidden="true">⌄</span>; }

function toggleDetailsWithKeyboard(event: ReactKeyboardEvent<HTMLElement>) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  const details = event.currentTarget.parentElement as HTMLDetailsElement | null;
  if (details) details.open = !details.open;
}

export default function Home() {
  const today = useMemo(() => kstToday(), []);
  const currentWeekStart = useMemo(() => getWeek(today)[0], [today]);
  const [selectedDate, setSelectedDate] = useState(today);
  const [focusedMaterialId, setFocusedMaterialId] = useState('');
  const [logWeekStart, setLogWeekStart] = useState(currentWeekStart);
  const [plans, setPlans] = useState<StudyPlan[]>([]);
  const [overduePlans, setOverduePlans] = useState<StudyPlan[]>([]);
  const [logs, setLogs] = useState<StudyLog[]>([]);
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [completedDates, setCompletedDates] = useState<string[]>([]);
  const [legacyLogsCount, setLegacyLogsCount] = useState(0);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [latestScore, setLatestScore] = useState<ToeicScore | null>(null);
  const [reviewNotes, setReviewNotes] = useState<ReviewNote[]>([]);
  const [quizMistakes, setQuizMistakes] = useState<QuizMistake[]>([]);
  const [editor, setEditor] = useState<Editor>(null);
  const [completionTarget, setCompletionTarget] = useState<CompletionTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [speakingMaterialId, setSpeakingMaterialId] = useState('');
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [accessEmail, setAccessEmail] = useState('');
  const week = useMemo(() => getWeek(selectedDate), [selectedDate]);
  const logWeek = useMemo(() => getWeek(logWeekStart), [logWeekStart]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    const query = new URLSearchParams({ date: selectedDate, calendarStart: week[0], calendarEnd: week[6], logStart: logWeek[0], logEnd: logWeek[6] });
    const [dashboardResult, materialsResult] = await Promise.allSettled([
      fetch(`/api/dashboard?${query}`, { cache: 'no-store' }).then(async (response) => {
        if (!response.ok) throw new Error('dashboard load failed');
        return response.json() as Promise<DashboardPayload>;
      }),
      fetch(`/api/materials?date=${selectedDate}`, { cache: 'no-store' }).then(async (response) => {
        if (!response.ok) throw new Error('materials load failed');
        return response.json() as Promise<unknown>;
      }),
    ]);
    if (dashboardResult.status === 'fulfilled') {
      const data = dashboardResult.value;
      setPlans(data.plans); setOverduePlans(data.overduePlans ?? []); setLogs(data.logs); setCompletedDates(data.completedDates);
      setLegacyLogsCount(data.legacyLogsCount ?? 0); setGoal(data.goal); setLatestScore(data.latestScore); setReviewNotes(data.reviewNotes ?? []); setQuizMistakes(data.quizMistakes ?? []);
    } else {
      setPlans([]); setOverduePlans([]); setLogs([]); setCompletedDates([]); setReviewNotes([]); setQuizMistakes([]);
      setNotice('학습 기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
    if (materialsResult.status === 'fulfilled') setMaterials(readMaterials(materialsResult.value));
    else { setMaterials([]); setNotice('예약 학습 자료를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'); }
    setLoading(false);
  }, [selectedDate, week, logWeek]);

  // Refresh the client dashboard whenever its selected date or log week changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadDashboard(); }, [loadDashboard]);
  useEffect(() => {
    function restoreStudyLink() {
      const params = new URLSearchParams(window.location.search);
      const date = params.get('date') ?? '';
      // Restore shareable plan links after hydration without rendering different server/client markup.
      if (validDashboardDate(date)) setSelectedDate(date);
      setFocusedMaterialId(params.get('material') ?? '');
    }

    restoreStudyLink();
    window.addEventListener('popstate', restoreStudyLink);
    return () => window.removeEventListener('popstate', restoreStudyLink);
  }, []);
  useEffect(() => {
    let active = true;
    void fetch('/api/dashboard/session', { cache: 'no-store' })
      .then(async (response) => response.ok ? response.json() as Promise<{ authenticated?: boolean; email?: string }> : { authenticated: false, email: undefined })
      .then((result) => {
        if (!active) return;
        setAuthState(result.authenticated ? 'authenticated' : 'guest');
        setAccessEmail(result.authenticated && result.email ? result.email : '');
      })
      .catch(() => { if (active) { setAuthState('guest'); setAccessEmail(''); } });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4200); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  useEffect(() => {
    if (!focusedMaterialId || loading) return;
    const material = materials.find((item) => item.id === focusedMaterialId);
    if (!material) return;
    requestAnimationFrame(() => document.getElementById(`material-${focusedMaterialId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }, [focusedMaterialId, loading, materials]);

  const studiedThisWeek = new Set(completedDates).size;
  const weekPercent = Math.round((studiedThisWeek / 7) * 100);
  const totalMinutes = plans.reduce((sum, plan) => sum + plan.minutes, 0);
  const sortedMaterials = [...materials].sort((a, b) => materialOrder.indexOf(a.kind) - materialOrder.indexOf(b.kind));
  const scoreProgress = goal && latestScore ? Math.min(100, Math.round((latestScore.score / Math.max(goal.targetScore, 1)) * 100)) : 0;
  const remainingScore = goal && latestScore ? goal.targetScore - latestScore.score : null;
  const englishGoalDate = shiftDate(today, 30);

  function openPlanMaterial(plan: StudyPlan) {
    if (!plan.id.startsWith('content:')) {
      setNotice('직접 만든 일정에는 아직 연결된 학습 자료가 없어요.');
      return;
    }
    const materialId = plan.id.slice('content:'.length);
    const params = new URLSearchParams(window.location.search);
    params.set('date', plan.planDate);
    params.set('material', materialId);
    window.history.pushState({}, '', `${window.location.pathname}?${params}`);
    setFocusedMaterialId(materialId);
  }

  function speakMaterial(material: StudyMaterial, payload: StudyPayload) {
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      setNotice('이 브라우저는 문장 듣기를 지원하지 않아요. Chrome 또는 Safari에서 다시 시도해 주세요.');
      return;
    }
    if (speakingMaterialId === material.id) { window.speechSynthesis.cancel(); setSpeakingMaterialId(''); return; }
    window.speechSynthesis.cancel();
    const language = materialKind[material.kind].language === 'ja' ? 'ja-JP' : 'en-US';
    const sentences = payload.items.map((item) => item.prompt.trim()).filter(Boolean);
    if (sentences.length === 0) { setNotice('읽어 줄 문장이 없어요.'); return; }
    setSpeakingMaterialId(material.id);
    sentences.forEach((sentence, index) => {
      const utterance = new SpeechSynthesisUtterance(sentence);
      utterance.lang = language;
      utterance.rate = language === 'ja-JP' ? 0.82 : 0.86;
      utterance.pitch = 1;
      if (index === sentences.length - 1) {
        utterance.onend = () => setSpeakingMaterialId('');
        utterance.onerror = (event) => {
          setSpeakingMaterialId('');
          if (event.error !== 'canceled' && event.error !== 'interrupted') setNotice('문장을 재생하지 못했어요. 브라우저 음성 설정을 확인해 주세요.');
        };
      }
      window.speechSynthesis.speak(utterance);
    });
  }

  function speakQuestion(material: StudyMaterial, item: StudyItem) {
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') { setNotice('이 브라우저에서는 문제 듣기를 지원하지 않아요.'); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance([item.prompt, ...(item.options?.map((option) => `${option.label}. ${option.text}`) ?? [])].join('. '));
    utterance.lang = material.kind === 'japanese' ? 'ja-JP' : 'en-US';
    utterance.rate = material.kind === 'japanese' ? 0.78 : 0.84;
    window.speechSynthesis.speak(utterance);
  }

  async function chooseQuizOption(material: StudyMaterial, item: StudyItem, index: number, label: string) {
    const key = `${material.id}:${index}`;
    if (quizAnswers[key]) return;
    setQuizAnswers((current) => ({ ...current, [key]: label }));
    const correctLabel = item.answer.match(/^\s*([A-D])\./i)?.[1]?.toUpperCase();
    if (!correctLabel || label === correctLabel || authState !== 'authenticated') return;
    const response = await fetch('/api/dashboard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'quiz-attempt', materialId: material.id, itemIndex: index, selectedLabel: label, correctLabel, prompt: item.prompt }) });
    if (!response.ok && !handleUnauthorized(response)) setNotice('오답 기록을 저장하지 못했어요.');
    else if (response.ok) await loadDashboard();
  }

  function requireAdmin(): boolean {
    if (authState === 'authenticated') return true;
    setNotice(authState === 'checking' ? 'Google 로그인 상태를 확인하고 있어요.' : 'Google Access 인증을 확인하지 못했어요. 페이지를 새로고침해 주세요.');
    return false;
  }

  function handleUnauthorized(response: Response): boolean {
    if (response.status !== 401) return false;
    setAuthState('guest'); setAccessEmail(''); setEditor(null); setCompletionTarget(null);
    setNotice('Google 로그인 인증이 만료됐어요. 페이지를 새로고침해 다시 로그인해 주세요.');
    return true;
  }

  function openEditor(value: Exclude<Editor, null>) { if (requireAdmin()) setEditor(value); }
  function openCompletion(target: CompletionTarget) { if (requireAdmin()) setCompletionTarget(target); }

  async function submitEditor(event: FormEvent<HTMLFormElement>, kind: 'external-log' | 'plan' | 'goal') {
    event.preventDefault(); setSaving(true);
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const response = await fetch('/api/dashboard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, ...values }) });
      if (!response.ok) { if (handleUnauthorized(response)) return; throw new Error('save failed'); }
      setEditor(null); setNotice(kind === 'plan' ? '학습 일정을 추가했어요.' : kind === 'goal' ? 'TOEIC 목표와 성적을 저장했어요.' : '외부 학습 기록을 저장했어요.');
      await loadDashboard();
    } catch { setNotice('저장하지 못했어요. 입력 내용을 확인해 주세요.'); }
    finally { setSaving(false); }
  }

  async function submitCompletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!completionTarget) return;
    setSaving(true);
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const isPlan = completionTarget.type === 'plan';
    try {
      const response = await fetch('/api/dashboard', {
        method: isPlan ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isPlan
          ? { id: completionTarget.id, completed: true, ...values }
          : { kind: 'material-completion', materialId: completionTarget.id, studyDate: completionTarget.date, ...values }),
      });
      if (!response.ok) { if (handleUnauthorized(response)) return; throw new Error('completion failed'); }
      setCompletionTarget(null); setNotice('학습 완료와 공부 기록을 함께 저장했어요.'); await loadDashboard();
    } catch { setNotice('학습 완료를 저장하지 못했어요. 입력 내용을 확인해 주세요.'); }
    finally { setSaving(false); }
  }

  async function undoPlan(plan: StudyPlan) {
    if (!requireAdmin()) return;
    const response = await fetch('/api/dashboard', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: plan.id, completed: false }) });
    if (response.ok) { setNotice('완료 표시와 자동 기록을 함께 취소했어요.'); await loadDashboard(); }
    else if (!handleUnauthorized(response)) setNotice('완료 상태를 바꾸지 못했어요.');
  }

  async function startMaterial(material: StudyMaterial) {
    if (!requireAdmin()) return;
    const response = await fetch('/api/dashboard', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: material.id, action: 'material-start' }) });
    if (response.ok) { setNotice(`${material.title} 학습을 시작했어요.`); await loadDashboard(); }
    else if (!handleUnauthorized(response)) setNotice('학습 시작 상태를 저장하지 못했어요.');
  }

  async function reschedulePlan(plan: StudyPlan) {
    if (!requireAdmin()) return;
    const confirmed = window.confirm(`${formatShort(plan.planDate)} 미완료 일정 “${plan.title}”을 ${formatShort(selectedDate)}에 새 일정으로 다시 계획합니다. 원래 일정은 재계획 이력으로 남습니다.`);
    if (!confirmed) return;
    const response = await fetch('/api/dashboard', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: plan.id, action: 'reschedule', planDate: selectedDate }) });
    if (response.ok) { setNotice(`${formatShort(selectedDate)} 일정으로 다시 계획했고 원본 이력을 남겼어요.`); await loadDashboard(); }
    else if (!handleUnauthorized(response)) setNotice(response.status === 409 ? '같은 날짜이거나 이미 처리된 일정은 다시 계획할 수 없어요.' : '재계획을 저장하지 못했어요.');
  }

  async function deleteItem(id: string, kind: 'log' | 'plan') {
    if (!requireAdmin()) return;
    const response = await fetch(`/api/dashboard?id=${encodeURIComponent(id)}&kind=${kind}`, { method: 'DELETE' });
    if (response.ok) { setNotice(kind === 'log' ? '기록을 삭제했어요.' : '일정과 연결된 자동 기록을 삭제했어요.'); await loadDashboard(); }
    else if (!handleUnauthorized(response)) setNotice('삭제하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }

  return (
    <main className="app-shell">
      <nav className="topbar">
        <a className="brand" href="#top" aria-label="Language Study Log 홈"><Image className="brand-mark" src="/brand-mark.svg" alt="" width={34} height={34} priority /><span>Language Study Log</span></a>
        <div className="nav-actions">
          <span className="streak-pill"><span>🔥</span> 이번 주 {studiedThisWeek}일</span>
          {authState === 'authenticated'
            ? <a className="admin-button" href="/cdn-cgi/access/logout" title={accessEmail || 'Google Access 로그인됨'}>Google 로그아웃</a>
            : <span className="access-status">{authState === 'checking' ? 'Google 인증 확인 중' : 'Google 인증 필요'}</span>}
          {selectedDate !== today && <button className="icon-button" onClick={() => setSelectedDate(today)}>오늘로 돌아가기</button>}
        </div>
      </nav>

      <div className="dashboard" id="top">
        <header className="hero-row">
          <div><p className="eyebrow">{formatKorean(selectedDate)}</p><h1>오늘도 한 걸음, <span>나의 학습 흐름으로.</span></h1><p className="hero-copy">계획을 선택하고 완료하면 공부 기록이 자동으로 이어집니다.</p></div>
          <div className="goal-ring" style={{ background: `conic-gradient(var(--coral) 0 ${weekPercent}%, #e6e2d9 ${weekPercent}% 100%)` }} aria-label={`이번 주 ${weekPercent}% 달성`}><div><strong>{weekPercent}</strong><span>%</span><small>이번 주</small></div></div>
        </header>

        <details className="accordion-card week-card" key={`week-${week[0]}`}>
          <summary className="section-heading"><div><p className="mini-label">WEEKLY VIEW</p><h2>{formatShort(week[0])} – {formatShort(week[6])}</h2></div><p><strong>{studiedThisWeek}</strong> / 7일 공부 <Marker /></p></summary>
          <div className="accordion-body week-grid">
            {week.map((date) => { const value = toLocalDate(date); const done = completedDates.includes(date); return (
              <button key={date} onClick={() => setSelectedDate(date)} className={`day-cell ${done ? 'done' : ''} ${date === selectedDate ? 'today' : ''}`} aria-current={date === selectedDate ? 'date' : undefined}>
                <span>{days[value.getDay()]}</span><strong>{value.getDate()}</strong><i>{done ? '✓' : date === today ? '오늘' : '—'}</i>
              </button>
            ); })}
          </div>
        </details>

        {!loading && overduePlans.length > 0 && <details className="accordion-card recovery-card" key={`recovery-${selectedDate}`}>
          <summary className="accordion-summary"><div><p className="mini-label">GENTLE RECOVERY</p><h2>놓친 공부, 다시 잡기</h2><p>{overduePlans.length}개 미완료 · 원본을 남기고 선택일에 새 일정 생성</p></div><Marker /></summary>
          <div className="accordion-body recovery-list">
            {overduePlans.map((plan) => <article className="recovery-item" key={plan.id}><div><span>{formatShort(plan.planDate)}에 놓침 · {plan.minutes}분</span><strong>{plan.title}</strong></div><button onClick={() => void reschedulePlan(plan)}>{formatShort(selectedDate)}에 다시 계획</button></article>)}
          </div>
        </details>}

        <div className="content-grid">
          <details className="accordion-card today-card" key={`plan-${selectedDate}`}>
            <summary className="card-title-row"><div><p className="mini-label">DAILY PLAN</p><h2>{selectedDate === today ? '오늘의 학습' : `${formatShort(selectedDate)} 학습`}</h2></div><span className="summary-meta">{plans.filter((plan) => plan.completed === 1).length}/{plans.length} 완료 <Marker /></span></summary>
            <div className="accordion-body"><button className="time-badge add-plan" onClick={() => openEditor('plan')}>＋ 일정 추가</button>
              {loading ? <div className="empty-state">일정을 불러오는 중...</div> : plans.length ? plans.map((plan) => (
                <article className="plan-row" key={plan.id}>
                  <button className={`plan-item ${plan.completed ? 'is-complete' : ''}`} onClick={() => openPlanMaterial(plan)} aria-label={`${plan.title} 학습 자료 보기`}>
                    <span className={`part-badge ${categoryClass[plan.category] ?? 'green'}`}>{plan.completed === 1 ? '✓' : plan.completed === 2 ? '↗' : categoryLabel[plan.category] ?? plan.category}</span>
                    <div><strong>{plan.title}</strong><p>{plan.completed === 2 ? '다른 날짜에 재계획됨' : plan.detail || '세부 메모 없음'}</p></div><span className="plan-time">{plan.minutes}분</span>
                  </button>
                  {plan.completed === 0 && <button className="small-action" onClick={() => openCompletion({ type: 'plan', id: plan.id, title: plan.title, part: plan.category, minutes: plan.minutes, date: plan.planDate })}>학습 완료 기록</button>}
                  {plan.completed === 1 && <button className="small-action subtle" onClick={() => void undoPlan(plan)}>완료 취소</button>}
                  <button className="delete-button plan-delete" onClick={() => void deleteItem(plan.id, 'plan')} aria-label={`${plan.title} 일정 삭제`}>×</button>
                </article>
              )) : <div className="empty-state"><strong>아직 예정된 공부가 없어요.</strong><span>일정을 추가하거나 아래 예약 자료에서 학습을 시작해 보세요.</span></div>}
              <div className="plan-footer"><span>예상 {totalMinutes}분</span><span>완료 시 기록 자동 생성</span></div>
              <section className="mistake-notebook"><header><div><span>DAILY WRONG ANSWERS</span><strong>오늘의 오답노트</strong></div><b>{quizMistakes.length}개</b></header>{quizMistakes.length ? <div>{quizMistakes.map((mistake) => <article key={mistake.id}><span>{mistake.materialKind === 'japanese' ? '일본어' : mistake.materialKind === 'toeic' ? 'TOEIC' : '영어'} · {mistake.itemIndex + 1}번</span><strong>{mistake.prompt.split('\n')[0]}</strong><p>내 답 {mistake.selectedLabel} <i>→</i> 정답 {mistake.correctLabel}</p></article>)}</div> : <p>아직 틀린 문제가 없어요. 문제를 풀면 날짜별로 여기에 자동 기록됩니다.</p>}</section>
              {reviewNotes.length > 0 && <div className="review-notes"><strong>다음 복습에 이어볼 메모</strong>{reviewNotes.map((item) => <p key={`${item.studyDate}-${item.title}`}><span>{formatShort(item.studyDate)} · {item.title}</span>{item.confusedItems || item.note}</p>)}</div>}
            </div>
          </details>

          <details className="accordion-card score-card" key={`goal-${selectedDate}`}>
            <summary className="score-summary"><div><p className="mini-label">MY GOALS</p><h2>학습 목표</h2><div className="goal-tags"><b>영어 말하기</b><b>JLPT N5</b><b>TOEIC</b></div></div><span>3개 목표 <Marker /></span></summary>
            <div className="accordion-body">
              <div className="goal-list">
                <article><span>한 달 집중</span><strong>영어로 자기소개·업무 소개</strong><small>{formatShort(englishGoalDate)}까지 · 막힘없이 말하기</small></article>
                <article><span>12월 자격증</span><strong>JLPT N5 합격</strong><small>12월 6일 시험 · {dDay('2026-12-06', today)}</small></article>
                <article><span>점수 목표</span><strong>{goal ? `TOEIC ${goal.targetScore}점` : 'TOEIC 목표 설정'}</strong><small>{goal ? `${goal.examDate} · ${dDay(goal.examDate, today)}` : '목표 점수와 시험일을 정해 주세요'}</small></article>
              </div>
              {goal ? <><div className="score-numbers"><strong>{goal.targetScore}</strong><span>점</span></div><div className="score-track"><i style={{ width: `${scoreProgress}%` }} /></div>
                <div className="score-meta"><span>{latestScore ? `최근 ${latestScore.score}점` : '최근 성적 없음'}</span><strong>{remainingScore === null ? '성적을 기록해 주세요' : remainingScore > 0 ? `${remainingScore}점 남음` : remainingScore === 0 ? '목표 달성' : `${Math.abs(remainingScore)}점 초과 달성`}</strong></div>
                {latestScore && <p className="score-source">{latestScore.scoreDate} · {scoreTypeLabels[latestScore.scoreType] ?? latestScore.scoreType}{latestScore.source ? ` · ${latestScore.source}` : ''}</p>}
                <p className="exam-date">다음 시험 · {goal.examDate} · {dDay(goal.examDate, today)}</p></> : <div className="score-empty"><strong>설정된 TOEIC 목표가 없어요.</strong><span>임의 점수 대신 직접 저장한 목표와 성적만 표시합니다.</span></div>}
              <button className="score-edit" onClick={() => openEditor('goal')}>{goal ? '목표·성적 수정' : '목표 설정하기'}</button>
            </div>
          </details>
        </div>

        <details className="accordion-card materials-section" key={`materials-${selectedDate}`}>
          <summary className="section-heading materials-heading"><div><p className="mini-label">DAILY MATERIALS</p><h2>예약 학습 자료</h2></div><p>{sortedMaterials.length}개 도착 <Marker /></p></summary>
          <div className="accordion-body">
            {loading ? <div className="empty-state material-empty">예약 자료를 불러오는 중...</div> : sortedMaterials.length ? <div className="materials-grid">
              {sortedMaterials.map((material) => { const meta = materialKind[material.kind]; const payload = readPayload(material.body); const audioAssets = material.assets.filter((asset) => asset.contentType.startsWith('audio/')); return (
                <details className={`material-card ${material.kind} ${focusedMaterialId === material.id ? 'is-focused' : ''}`} id={`material-${material.id}`} open={focusedMaterialId === material.id || undefined} key={material.id}>
                  <summary className="material-card-summary"><div><span className="material-kind">{meta.label}</span><small>{material.status === 'completed' ? '완료' : material.status === 'in_progress' ? '학습 중' : meta.description}</small></div><strong>{material.title}</strong><span>{payload?.items.length ?? 0}개 <Marker /></span></summary>
                  <div className="material-card-body"><p className="material-summary">{material.summary}</p>
                    <div className="material-actions">{payload && <button className="listen-button" onClick={() => speakMaterial(material, payload)} aria-pressed={speakingMaterialId === material.id}><span aria-hidden="true">{speakingMaterialId === material.id ? '■' : '▶'}</span>{speakingMaterialId === material.id ? ` ${meta.label} 듣기 멈추기` : ` ${meta.label} ${payload.items.length}문장 연속 듣기`}</button>}{material.status === 'ready' && <button onClick={() => void startMaterial(material)}>학습 시작</button>}<button onClick={() => openCompletion({ type: 'material', id: material.id, title: material.title, part: meta.part, minutes: meta.minutes, date: selectedDate })}>{material.status === 'completed' ? '완료 기록 수정' : '학습 완료 기록'}</button></div>
                    {payload && <p className="listen-help">{material.kind === 'japanese' ? '일본어 음성' : '영어 음성'}으로 문제를 한 문장씩 천천히 읽어 드려요.</p>}
                    {payload?.speakingSentence && <div className="speaking-block"><span>말하기 한 문장</span><strong lang={meta.language}>{payload.speakingSentence}</strong>{payload.speakingMeaning && <p>{payload.speakingMeaning}</p>}</div>}
                    {audioAssets.map((asset) => <figure className="material-audio" key={asset.id}><figcaption>듣기 자료 · {asset.filename}</figcaption><audio controls preload="none" src={asset.url}>오디오를 재생할 수 없는 브라우저입니다.</audio></figure>)}
                    {payload?.items.length ? <div className="material-items">{payload.items.map((item, index) => {
                      const quizKey = `${material.id}:${index}`;
                      const selected = quizAnswers[quizKey];
                      const correctLabel = item.answer.match(/^\s*([A-D])\./i)?.[1]?.toUpperCase();
                      return item.options && correctLabel ? <article className="material-item quiz-item" key={quizKey}>
                        <header><span>{String(index + 1).padStart(2, '0')}</span><button type="button" onClick={() => speakQuestion(material, item)} aria-label={`${index + 1}번 문제와 선택지 듣기`}>🔊 문제 듣기</button></header>
                        <strong className="quiz-prompt" lang={meta.language}>{item.prompt}</strong>
                        <div className="quiz-options">{item.options.map((option) => { const chosen = selected === option.label; const correct = option.label === correctLabel; return <button type="button" key={option.label} disabled={Boolean(selected)} className={chosen ? correct ? 'is-correct' : 'is-wrong' : selected && correct ? 'is-answer' : ''} onClick={() => void chooseQuizOption(material, item, index, option.label)}><b>{option.label}</b><span>{option.text}</span>{chosen && <i aria-label={correct ? '정답' : '오답'}>{correct ? '○' : '×'}</i>}</button>; })}</div>
                        {selected && <div className={`quiz-result ${selected === correctLabel ? 'correct' : 'wrong'}`}><strong>{selected === correctLabel ? '정답이에요!' : `오답이에요. 정답은 ${correctLabel}예요.`}</strong>{selected !== correctLabel && <small>{authState === 'authenticated' ? '오답 기록에 자동 저장했어요.' : '로그인하면 오답 기록이 자동 저장돼요.'}</small>}<p>{item.explanation}</p></div>}
                      </article> : <details className="material-item" key={quizKey}><summary><span>{String(index + 1).padStart(2, '0')}</span><div><strong lang={meta.language}>{item.prompt}</strong></div></summary><div className="material-answer"><button className="question-listen" type="button" onClick={() => speakQuestion(material, item)}>🔊 문제 듣기</button><div><span>정답</span><p>{item.answer}</p></div>{item.explanation && <div><span>설명</span><p>{item.explanation}</p></div>}</div></details>;
                    })}</div> : <p className="material-unavailable">상세 학습 내용은 준비 중이에요.</p>}
                  </div>
                </details>
              ); })}
            </div> : <div className="empty-state material-empty"><strong>이 날짜에 도착한 예약 학습 자료가 없어요.</strong><span>영어, 일본어, TOEIC 자료가 도착하면 여기에 모아 보여드려요.</span></div>}
          </div>
        </details>

        <details className="accordion-card recent-section" key={`logs-${logWeek[0]}`}>
          <summary className="section-heading recent-heading"><div><p className="mini-label">STUDY LOG</p><h2>주간 학습 기록</h2></div><p>{logs.length}개 기록 <Marker /></p></summary>
          <div className="accordion-body">
            <div className="log-week-toolbar"><strong>{weekLabel(logWeek)}</strong><div><button onClick={() => setLogWeekStart(shiftDate(logWeek[0], -7))}>이전</button>{logWeek[0] !== currentWeekStart && <button onClick={() => setLogWeekStart(currentWeekStart)}>이번 주로 돌아가기</button>}<button onClick={() => setLogWeekStart(shiftDate(logWeek[0], 7))}>다음</button><button className="external-log" onClick={() => openEditor('external-log')}>외부 학습 기록 ＋</button></div></div>
            {legacyLogsCount > 0 && <p className="legacy-notice">출처를 확인할 수 없는 기존 기록 {legacyLogsCount}개는 실제 주간 기록에서 제외했습니다.</p>}
            <div className="log-week-grid">{logWeek.map((date, index) => <section className={`log-day ${date === today ? 'is-today' : ''}`} key={date}><header><strong>{toLocalDate(date).getDate()} ({weekDays[index]})</strong>{date === today && <span>오늘</span>}</header><div className="log-chips">
              {logs.filter((log) => log.studyDate === date).map((log) => <details className="log-chip" key={log.id}><summary onKeyDown={toggleDetailsWithKeyboard}><span>{log.part}</span><strong>{log.title}</strong><small>{log.minutes}분 · {log.score || '완료'}</small></summary><div><p><b>연결 자료</b>{log.sourceLabel || '없음'}</p><p><b>입력 출처</b>{sourceLabels[log.sourceType] ?? log.sourceType}</p><p><b>생성 시각</b>{formatCreated(log.createdAt)}</p>{log.note && <p><b>메모</b>{log.note}</p>}{log.confusedItems && <p><b>헷갈린 항목</b>{log.confusedItems}</p>}<button className="delete-log" onClick={() => void deleteItem(log.id, 'log')}>기록 삭제</button></div></details>)}
            </div></section>)}</div>
          </div>
        </details>
      </div>

      {editor && <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setEditor(null); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="modal-close" onClick={() => setEditor(null)} aria-label="닫기">×</button>
        <p className="mini-label">{editor === 'plan' ? 'DAILY PLAN' : editor === 'goal' ? 'TOEIC GOAL' : 'EXTERNAL STUDY'}</p><h2 id="modal-title">{editor === 'plan' ? '학습 일정 추가하기' : editor === 'goal' ? 'TOEIC 목표와 실제 성적' : '사이트 밖 학습 기록하기'}</h2><p className="modal-copy">{editor === 'external-log' ? '예약 자료나 일정 완료 기록은 자동 생성됩니다. 이 창은 사이트 밖에서 공부한 경우에만 사용해 주세요.' : '저장한 값만 화면의 근거로 사용합니다.'}</p>
        {editor === 'external-log' && <form onSubmit={(event) => void submitEditor(event, 'external-log')}><div className="form-grid"><label>공부한 날짜<input name="studyDate" type="date" defaultValue={selectedDate} required /></label><label>영역<select name="part" defaultValue="LC"><option>LC</option><option>RC</option><option>VOCA</option><option>TEST</option><option>ENGLISH</option><option>JAPANESE</option></select></label></div><label>공부한 내용<input name="title" required maxLength={80} /></label><div className="form-grid"><label>공부 시간<input name="minutes" type="number" min="1" max="600" defaultValue="40" required /></label><label>점수 또는 성과<input name="score" maxLength={30} /></label></div><label>한 줄 메모<textarea name="note" maxLength={300} /></label><label>헷갈린 항목<textarea name="confusedItems" maxLength={300} /></label><button className="primary-button modal-submit" disabled={saving}>{saving ? '저장 중...' : '외부 학습 기록 저장'}</button></form>}
        {editor === 'plan' && <form onSubmit={(event) => void submitEditor(event, 'plan')}><div className="form-grid"><label>예정 날짜<input name="planDate" type="date" defaultValue={selectedDate} required /></label><label>분류<select name="category" defaultValue="LC"><option>LC</option><option>RC</option><option>VOCA</option><option>TEST</option><option>ENGLISH</option><option>JAPANESE</option></select></label></div><label>학습 제목<input name="title" required maxLength={80} /></label><label>세부 계획<input name="detail" maxLength={120} /></label><label>예상 시간 (분)<input name="minutes" type="number" min="1" max="600" defaultValue="40" required /></label><button className="primary-button modal-submit" disabled={saving}>{saving ? '저장 중...' : '일정 추가하기'}</button></form>}
        {editor === 'goal' && <form onSubmit={(event) => void submitEditor(event, 'goal')}><div className="form-grid"><label>목표 점수<input name="targetScore" type="number" min="0" max="990" step="5" defaultValue={goal?.targetScore ?? ''} required /></label><label>시험일<input name="examDate" type="date" defaultValue={goal?.examDate ?? ''} required /></label></div><p className="form-separator">최근 실제 성적 추가 (선택)</p><div className="form-grid"><label>점수<input name="latestScore" type="number" min="0" max="990" step="5" /></label><label>응시일<input name="scoreDate" type="date" /></label></div><div className="form-grid"><label>성적 유형<select name="scoreType" defaultValue="official"><option value="official">공식 TOEIC</option><option value="mock">모의고사</option><option value="practice">연습 점수</option></select></label><label>출처<input name="scoreSource" placeholder="예: ETS 성적표" maxLength={80} /></label></div><button className="primary-button modal-submit" disabled={saving}>{saving ? '저장 중...' : '목표·성적 저장'}</button></form>}
      </section></div>}

      {completionTarget && <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setCompletionTarget(null); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="completion-title"><button className="modal-close" onClick={() => setCompletionTarget(null)} aria-label="닫기">×</button><p className="mini-label">LEARNING COMPLETE</p><h2 id="completion-title">학습 완료 기록</h2><p className="modal-copy">{completionTarget.title}과 연결된 기록을 자동으로 만듭니다.</p><form onSubmit={(event) => void submitCompletion(event)}><label>학습 시간<input name="minutes" type="number" min="1" max="600" defaultValue={completionTarget.minutes} required /></label><label>점수 또는 성과<input name="score" placeholder="예: 8/10, 완료" maxLength={30} /></label><label>한 줄 메모<textarea name="note" placeholder="다음에 기억할 것" maxLength={300} /></label><label>헷갈린 항목<textarea name="confusedItems" placeholder="다음 복습에 다시 보여줄 내용" maxLength={300} /></label><button className="primary-button modal-submit" disabled={saving}>{saving ? '저장 중...' : '완료하고 기록 만들기'}</button></form></section></div>}

      {notice && <div className="toast" role="status">{notice}</div>}
    </main>
  );
}
