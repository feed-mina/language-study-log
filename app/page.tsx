'use client';

import Image from 'next/image';
import StudySchedule from './components/StudySchedule';
import { FormEvent, KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { correctOptionLabel, dDay, getWeek, kstToday, quizItemSnapshot, quizItemVersion, shiftDate, splitLegacyQuestion, toLocalDate, weekLabel, type StudyOption } from './dashboard-utils';
import { selectSpeechVoice } from './speech';

type StudyPlanStatus = 'planned' | 'completed' | 'rescheduled' | 'archived';
type StudyPlan = { id: string; planDate: string; category: string; title: string; detail: string; minutes: number; completed: number; status: StudyPlanStatus; sourcePlanId?: string | null; archivedAt?: string | null; archiveReason?: string };
type StudyLog = { id: string; studyDate: string; part: string; title: string; minutes: number; score: string; note: string; sourceType: string; sourceId?: string | null; sourceLabel: string; confusedItems: string; createdAt: string };
type StudyItem = { prompt: string; options?: StudyOption[]; answer: string; explanation: string };
type StudyPayload = { title: string; summary: string; speakingSentence?: string; speakingMeaning?: string; items: StudyItem[] };
type StudyAsset = { id: string; kind: string; filename: string; contentType: string; bytes: number; url: string };
type StudyMaterial = { id: string; date: string; kind: 'english' | 'japanese' | 'toeic'; title: string; summary: string; body: unknown; status: string; createdAt: string; assets: StudyAsset[] };
type Goal = { targetScore: number; examDate: string; updatedAt: string };
type ToeicScore = { score: number; scoreDate: string; scoreType: string; source: string };
type ReviewNote = { title: string; studyDate: string; note: string; confusedItems: string };
type QuizMistake = { id: string; latestRequestId: string; materialId: string; materialDate: string; materialTitle: string; itemIndex: number; itemHash: string; prompt: string; options: StudyOption[]; selectedLabel: StudyOption['label']; correctLabel: StudyOption['label']; explanation: string; attempts: number; firstWrongAt: string; lastWrongAt: string };
type QuizAnswerState = { selectedLabel: StudyOption['label']; saving: boolean; saved: boolean; failed: boolean; correct: boolean | null; requestId: string; attemptedAt: string };
type QuizSaveResult = { correct: boolean; resolved: boolean; itemHash: string } | 'stale' | null;
type DashboardPayload = { plans: StudyPlan[]; overduePlans: StudyPlan[]; logs: StudyLog[]; completedDates: string[]; legacyLogsCount: number; goal: Goal | null; latestScore: ToeicScore | null; reviewNotes: ReviewNote[]; quizMistakes: QuizMistake[] };
type AuthState = 'checking' | 'guest' | 'authenticated';
type Editor = 'external-log' | 'plan' | 'goal' | null;
type CompletionTarget = { type: 'plan' | 'material'; id: string; title: string; part: string; minutes: number; date: string };
type VoiceStatus = 'preparing' | 'ready' | 'unsupported';
type SpeakingTarget = { materialId: string; key: string } | null;
type SpeechSegment = { text?: string; key?: string; pause?: number };

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
  if (!Array.isArray(value) || value.length !== 4) return undefined;
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


async function responseError(response: Response, fallback: string): Promise<string> {
  const raw = (await response.text()).trim().slice(0, 400);
  if (!raw) return `${fallback} (HTTP ${response.status})`;
  try {
    const parsed = JSON.parse(raw) as { error?: unknown; message?: unknown };
    if (typeof parsed.error === 'string') return parsed.error;
    if (typeof parsed.message === 'string') return parsed.message;
  } catch { /* Preserve non-JSON upstream errors as written. */ }
  return raw;
}

function Marker() { return <span className="accordion-marker" aria-hidden="true">⌄</span>; }

function toggleDetailsWithKeyboard(event: ReactKeyboardEvent<HTMLElement>) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  const details = event.currentTarget.parentElement as HTMLDetailsElement | null;
  if (details) details.open = !details.open;
}

/**
 * 학습 화면에는 한국어 안내와 목표 언어 문장이 함께 있을 수 있다.
 * 목표 언어 음성에는 한글 안내를 넣지 않아 발음이 섞이지 않게 한다.
 */
function targetSpeechText(value: string, language: 'en-US' | 'ja-JP'): string {
  const targetOnly = value.replace(/\s*(?:읽기|뜻|정답|설명)\s*:[\s\S]*$/u, '').replace(/[①②③④]/g, ' ');
  const withoutKorean = targetOnly.replace(/[가-힣ㄱ-ㅎㅏ-ㅣ]+/g, ' ');
  if (language === 'ja-JP') {
    return withoutKorean.replace(/\s+/g, ' ').trim();
  }
  // 영어 자료의 기호·숫자·문장부호는 남기되 한글 설명만 제거한다.
  return withoutKorean.replace(/\s+/g, ' ').trim();
}

function hasTargetLanguageText(value: string, language: 'en-US' | 'ja-JP'): boolean {
  return language === 'ja-JP' ? /[\u3040-\u30ff\u3400-\u9fff]/u.test(value) : /[A-Za-z]/.test(value);
}

function exampleSpeechText(item: StudyItem, language: 'en-US' | 'ja-JP'): string {
  const prompt = targetSpeechText(item.prompt, language);
  if (hasTargetLanguageText(prompt, language)) return prompt;
  return item.options?.map((option) => targetSpeechText(option.text, language)).find((option) => hasTargetLanguageText(option, language)) ?? prompt;
}

function exampleLabel(language: 'en-US' | 'ja-JP') { return language === 'ja-JP' ? '일본어 예문 5개 연속 듣기' : '영어 예문 5개 연속 듣기'; }
function questionLabel(language: 'en-US' | 'ja-JP', index: number) { return language === 'ja-JP' ? `問題 ${index + 1}` : `Question ${index + 1}`; }

export default function Home() {
  const today = useMemo(() => kstToday(), []);
  const currentWeekStart = useMemo(() => getWeek(today)[0], [today]);
  const [selectedDate, setSelectedDate] = useState(today);
  const [focusedMaterialId, setFocusedMaterialId] = useState('');
  const [focusedQuizItemIndex, setFocusedQuizItemIndex] = useState<number | null>(null);
  const [logWeekStart, setLogWeekStart] = useState(currentWeekStart);
  const [scheduleRevision, setScheduleRevision] = useState(0);
  const [plans, setPlans] = useState<StudyPlan[]>([]);
  const [logs, setLogs] = useState<StudyLog[]>([]);
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [completedDates, setCompletedDates] = useState<string[]>([]);
  const [legacyLogsCount, setLegacyLogsCount] = useState(0);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [latestScore, setLatestScore] = useState<ToeicScore | null>(null);
  const [reviewNotes, setReviewNotes] = useState<ReviewNote[]>([]);
  const [quizMistakes, setQuizMistakes] = useState<QuizMistake[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, QuizAnswerState>>({});
  const [mistakeAnswers, setMistakeAnswers] = useState<Record<string, QuizAnswerState>>({});
  const [editor, setEditor] = useState<Editor>(null);
  const [completionTarget, setCompletionTarget] = useState<CompletionTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('preparing');
  const [speechVoices, setSpeechVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speakingAction, setSpeakingAction] = useState<SpeakingTarget>(null);
  const [speakingTarget, setSpeakingTarget] = useState<SpeakingTarget>(null);
  const speechRun = useRef(0);
  const dashboardLoadRun = useRef(0);
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [accessEmail, setAccessEmail] = useState('');
  const selectedDateRef = useRef(selectedDate);
  const week = useMemo(() => getWeek(selectedDate), [selectedDate]);
  const logWeek = useMemo(() => getWeek(logWeekStart), [logWeekStart]);

  const loadDashboard = useCallback(async (silent = false) => {
    if (selectedDate !== selectedDateRef.current) return;
    const loadRun = ++dashboardLoadRun.current;
    if (!silent) setLoading(true);
    const query = new URLSearchParams({ date: selectedDate, recovery: 'none', recoveryDate: today, calendarStart: week[0], calendarEnd: week[6], logStart: logWeek[0], logEnd: logWeek[6] });
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
    if (loadRun !== dashboardLoadRun.current) return;
    if (dashboardResult.status === 'fulfilled') {
      const data = dashboardResult.value;
      const nextMistakes = data.quizMistakes ?? [];
      setPlans(data.plans); setLogs(data.logs); setCompletedDates(data.completedDates);
      setScheduleRevision(value => value + 1);
      setLegacyLogsCount(data.legacyLogsCount ?? 0); setGoal(data.goal); setLatestScore(data.latestScore); setReviewNotes(data.reviewNotes ?? []); setQuizMistakes(nextMistakes);
      setMistakeAnswers((current) => Object.fromEntries(nextMistakes.flatMap((mistake) => {
        const answer = current[mistake.id];
        return answer && (answer.saving || answer.failed || answer.requestId === mistake.latestRequestId) ? [[mistake.id, answer]] : [];
      })));
    } else {
      setPlans([]); setLogs([]); setCompletedDates([]); setReviewNotes([]); setQuizMistakes([]);
      setNotice('학습 기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
    if (materialsResult.status === 'fulfilled') setMaterials(readMaterials(materialsResult.value));
    else { setMaterials([]); setNotice('예약 학습 자료를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'); }
    setLoading(false);
  }, [selectedDate, today, week, logWeek]);

  // Refresh the client dashboard whenever its selected date or log week changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadDashboard(); }, [loadDashboard]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const date = params.get('date') ?? '';
    // Restore shareable plan links after hydration without rendering different server/client markup.
    if (validDashboardDate(date)) selectDate(date);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFocusedMaterialId(params.get('material') ?? '');
    const rawItemIndex = params.get('item');
    const itemIndex = rawItemIndex === null ? Number.NaN : Number(rawItemIndex);
    setFocusedQuizItemIndex(Number.isInteger(itemIndex) && itemIndex >= 0 && itemIndex <= 20 ? itemIndex : null);
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
  // Chrome은 첫 getVoices()에서 빈 배열을 돌려줄 수 있다. 페이지가 열린 즉시
  // 목록을 요청하고 voiceschanged까지 기다려서, 첫 듣기 클릭을 버리지 않는다.
  useEffect(() => {
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVoiceStatus('unsupported');
      return;
    }
    const synth = window.speechSynthesis;
    const refreshVoices = () => {
      const next = synth.getVoices();
      setSpeechVoices(next);
      setVoiceStatus(next.length ? 'ready' : 'preparing');
    };
    refreshVoices();
    synth.addEventListener('voiceschanged', refreshVoices);
    return () => {
      synth.removeEventListener('voiceschanged', refreshVoices);
      speechRun.current += 1;
      synth.cancel();
    };
  }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4200); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    if (!focusedMaterialId || loading) return;
    const material = materials.find((item) => item.id === focusedMaterialId);
    if (!material) return;
    requestAnimationFrame(() => {
      const section = document.getElementById('materials-section') as HTMLDetailsElement | null;
      const card = document.getElementById(`material-${focusedMaterialId}`) as HTMLDetailsElement | null;
      if (section) section.open = true;
      if (card) card.open = true;
      const quizItem = focusedQuizItemIndex === null ? null : document.getElementById(`quiz-${focusedMaterialId}-${focusedQuizItemIndex}`);
      const target = quizItem ?? card;
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (quizItem instanceof HTMLElement) quizItem.focus({ preventScroll: true });
    });
  }, [focusedMaterialId, focusedQuizItemIndex, loading, materials]);

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
    params.delete('item');
    window.history.pushState({}, '', `${window.location.pathname}?${params}`);
    setFocusedQuizItemIndex(null);
    setFocusedMaterialId(materialId);
  }

  function selectDate(value: string) {
    selectedDateRef.current = value;
    setSelectedDate(value);
  }

  function speechLanguage(material: StudyMaterial): 'en-US' | 'ja-JP' {
    return materialKind[material.kind].language === 'ja' ? 'ja-JP' : 'en-US';
  }

  function selectedVoice(language: 'en-US' | 'ja-JP' | 'ko-KR') {
    return selectSpeechVoice(speechVoices, language);
  }

  function listeningState(language: 'en-US' | 'ja-JP') {
    if (voiceStatus === 'unsupported') return { disabled: true, label: '이 브라우저는 듣기를 지원하지 않아요' };
    if (voiceStatus === 'preparing') return { disabled: true, label: language === 'ja-JP' ? '일본어 음성 준비 중…' : '영어 음성 준비 중…' };
    if (!selectedVoice(language)) return { disabled: true, label: language === 'ja-JP' ? '일본어 음성 없음' : '영어 음성 없음' };
    return { disabled: false, label: '' };
  }

  function isSpeaking(materialId: string, key: string) {
    return speakingTarget?.materialId === materialId && speakingTarget.key === key;
  }

  function stopSpeaking() {
    speechRun.current += 1;
    window.speechSynthesis?.cancel();
    setSpeakingAction(null);
    setSpeakingTarget(null);
  }

  function playSegments(material: StudyMaterial, key: string, language: 'en-US' | 'ja-JP' | 'ko-KR', segments: SpeechSegment[]) {
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      setNotice('이 브라우저는 문장 듣기를 지원하지 않아요. Chrome 또는 Safari에서 다시 시도해 주세요.');
      return;
    }
    if (speakingAction?.materialId === material.id && speakingAction.key === key) {
      stopSpeaking();
      return;
    }
    const voice = selectedVoice(language);
    if (!voice) {
      setNotice(language === 'ja-JP' ? '일본어 음성을 준비 중이에요. 잠시만 기다려 주세요.' : language === 'en-US' ? '영어 음성을 준비 중이에요. 잠시만 기다려 주세요.' : '한국어 음성을 찾지 못했어요. OS 음성 설정을 확인해 주세요.');
      return;
    }
    const queue = segments.filter((segment) => segment.pause || segment.text?.trim());
    if (!queue.length) { setNotice('읽어 줄 문장이 없어요.'); return; }
    const run = speechRun.current + 1;
    speechRun.current = run;
    window.speechSynthesis.cancel();
    setSpeakingAction({ materialId: material.id, key });
    const next = (index: number) => {
      if (speechRun.current !== run) return;
      if (index >= queue.length) { setSpeakingAction(null); setSpeakingTarget(null); return; }
      const segment = queue[index];
      if (segment.pause) {
        window.setTimeout(() => next(index + 1), segment.pause);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(segment.text ?? '');
      utterance.lang = language;
      utterance.voice = voice;
      utterance.rate = language === 'ja-JP' ? 0.82 : language === 'en-US' ? 0.86 : 0.9;
      utterance.pitch = 1;
      if (segment.key) setSpeakingTarget({ materialId: material.id, key: segment.key });
      utterance.onend = () => next(index + 1);
      utterance.onerror = (event) => {
        if (speechRun.current !== run) return;
        setSpeakingAction(null);
        setSpeakingTarget(null);
        if (event.error !== 'canceled' && event.error !== 'interrupted') setNotice('문장을 재생하지 못했어요. 브라우저 음성 설정을 확인해 주세요.');
      };
      window.speechSynthesis.speak(utterance);
    };
    next(0);
  }

  function speakExamples(material: StudyMaterial, payload: StudyPayload) {
    const language = speechLanguage(material);
    playSegments(material, 'examples', language, payload.items.slice(0, 5).flatMap((item, index) => [
      { text: exampleSpeechText(item, language), key: `item-${index}-prompt` },
      ...(index < Math.min(5, payload.items.length) - 1 ? [{ pause: 360 }] : []),
    ]));
  }

  function speakSentence(material: StudyMaterial, item: StudyItem, index: number) {
    const language = speechLanguage(material);
    playSegments(material, `item-${index}-sentence`, language, [{ text: exampleSpeechText(item, language), key: `item-${index}-prompt` }]);
  }

  function speakQuestion(material: StudyMaterial, item: StudyItem, index: number) {
    const language = speechLanguage(material);
    const options = item.options ?? [];
    const segments: SpeechSegment[] = [
      { text: questionLabel(language, index), key: `item-${index}-number` },
      { text: targetSpeechText(item.prompt, language), key: `item-${index}-prompt` },
    ];
    options.forEach((option) => {
      segments.push({ pause: 320 }, { text: option.label, key: `item-${index}-option-${option.label}` }, { text: targetSpeechText(option.text, language), key: `item-${index}-option-${option.label}` });
    });
    playSegments(material, `item-${index}-question`, language, segments);
  }

  function speakOption(material: StudyMaterial, option: StudyOption, index: number) {
    const language = speechLanguage(material);
    playSegments(material, `item-${index}-option-${option.label}`, language, [
      { text: option.label, key: `item-${index}-option-${option.label}` },
      { text: targetSpeechText(option.text, language), key: `item-${index}-option-${option.label}` },
    ]);
  }

  function speakExplanation(material: StudyMaterial, item: StudyItem, index: number) {
    playSegments(material, `item-${index}-explanation`, 'ko-KR', [{ text: `정답. ${item.answer}. 해설. ${item.explanation}`, key: `item-${index}-explanation` }]);
  }

  async function saveQuizAnswer(input: {
    materialId: string;
    itemIndex: number;
    selectedLabel: StudyOption['label'];
    requestId: string;
    attemptedAt: string;
    itemVersion?: string;
    itemHash?: string;
  }): Promise<QuizSaveResult> {
    try {
      const response = await fetch('/api/dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'quiz-attempt', ...input }),
      });
      if (!response.ok) {
        if (response.status === 409) {
          setNotice(await responseError(response, '학습 자료가 갱신되었습니다.'));
          await loadDashboard(true);
          return 'stale';
        }
        if (!handleUnauthorized(response)) setNotice(await responseError(response, '오답 기록을 저장하지 못했어요.'));
        return null;
      }
      const result = await response.json() as { correct?: unknown; resolved?: unknown; itemHash?: unknown };
      if (typeof result.correct !== 'boolean' || typeof result.itemHash !== 'string' || !/^[0-9a-f]{64}$/i.test(result.itemHash)) {
        setNotice('오답 기록 응답을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
        return null;
      }
      return { correct: result.correct, resolved: Boolean(result.resolved), itemHash: result.itemHash };
    } catch {
      setNotice('오답 기록을 저장하지 못했어요. 네트워크 연결을 확인해 주세요.');
      return null;
    }
  }

  async function chooseQuizOption(material: StudyMaterial, item: StudyItem, itemIndex: number, selectedLabel: StudyOption['label'], retry = false) {
    if (!requireAdmin()) return;
    const snapshot = quizItemSnapshot(item.prompt, item.options, item.answer, item.explanation);
    if (!snapshot) return;
    const key = `${material.id}:${itemIndex}`;
    const previousAnswer = quizAnswers[key];
    if (previousAnswer && !retry) return;
    const requestId = retry && previousAnswer ? previousAnswer.requestId : crypto.randomUUID();
    const attemptedAt = retry && previousAnswer ? previousAnswer.attemptedAt : new Date().toISOString();
    const pending = { selectedLabel, saving: true, saved: false, failed: false, correct: null, requestId, attemptedAt };
    setQuizAnswers((current) => ({ ...current, [key]: pending }));
    const result = await saveQuizAnswer({
      materialId: material.id,
      itemIndex,
      selectedLabel,
      requestId,
      attemptedAt,
      itemVersion: quizItemVersion(snapshot),
    });
    if (result === 'stale') {
      setQuizAnswers((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      return;
    }
    setQuizAnswers((current) => ({
      ...current,
      [key]: { ...pending, saving: false, saved: Boolean(result), failed: !result, correct: result?.correct ?? null },
    }));
    if (!result) return;
    const mistakeId = `${material.id}:${itemIndex}:${result.itemHash}`;
    setMistakeAnswers((current) => {
      const next = { ...current };
      delete next[mistakeId];
      return next;
    });
    await loadDashboard(true);
  }

  async function chooseMistakeOption(mistake: QuizMistake, selectedLabel: StudyOption['label'], retry = false) {
    if (!requireAdmin()) return;
    const key = mistake.id;
    const previousAnswer = mistakeAnswers[key];
    if (previousAnswer && !retry) return;
    const requestId = retry && previousAnswer ? previousAnswer.requestId : crypto.randomUUID();
    const attemptedAt = retry && previousAnswer ? previousAnswer.attemptedAt : new Date().toISOString();
    const pending = { selectedLabel, saving: true, saved: false, failed: false, correct: null, requestId, attemptedAt };
    setMistakeAnswers((current) => ({ ...current, [key]: pending }));
    const result = await saveQuizAnswer({
      materialId: mistake.materialId,
      itemIndex: mistake.itemIndex,
      selectedLabel,
      requestId,
      attemptedAt,
      itemHash: mistake.itemHash,
    });
    if (result === 'stale') {
      setMistakeAnswers((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      return;
    }
    setMistakeAnswers((current) => ({
      ...current,
      [key]: { ...pending, saving: false, saved: Boolean(result), failed: !result, correct: result?.correct ?? null },
    }));
    if (!result) return;
    if (result.correct) setNotice('맞았습니다. 이 문제를 오답노트에서 해결 처리했어요.');
    await loadDashboard(true);
  }

  function retryMistake(mistake: QuizMistake) {
    const key = mistake.id;
    setMistakeAnswers((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function openMistakeMaterial(mistake: QuizMistake) {
    const params = new URLSearchParams(window.location.search);
    params.set('date', mistake.materialDate);
    params.set('material', mistake.materialId);
    params.set('item', String(mistake.itemIndex));
    window.history.pushState({}, '', `${window.location.pathname}?${params}`);
    selectDate(mistake.materialDate);
    setFocusedMaterialId(mistake.materialId);
    setFocusedQuizItemIndex(mistake.itemIndex);
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
          {selectedDate !== today && <button className="icon-button" onClick={() => selectDate(today)}>오늘로 돌아가기</button>}
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
              <button key={date} onClick={() => selectDate(date)} className={`day-cell ${done ? 'done' : ''} ${date === selectedDate ? 'today' : ''}`} aria-current={date === selectedDate ? 'date' : undefined}>
                <span>{days[value.getDay()]}</span><strong>{value.getDate()}</strong><i>{done ? '✓' : date === today ? '오늘' : '—'}</i>
              </button>
            ); })}
          </div>
        </details>

        <StudySchedule date={selectedDate} today={today} revision={scheduleRevision} canEdit={authState === 'authenticated' && !loading} onDate={selectDate} onChanged={() => void loadDashboard(true)} onAdd={() => openEditor('plan')} onComplete={id => { const plan = plans.find(p => p.id === id); if (plan) openCompletion({ type: 'plan', id: plan.id, title: plan.title, part: plan.category, minutes: plan.minutes, date: plan.planDate }); }} onUndo={id => { const plan = plans.find(p => p.id === id); if (plan) void undoPlan(plan); }} onOpen={id => { const plan = plans.find(p => p.id === id); if (plan) openPlanMaterial(plan); }} />

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

        <details className="accordion-card materials-section" id="materials-section" key={`materials-${selectedDate}`}>
          <summary className="section-heading materials-heading"><div><p className="mini-label">DAILY MATERIALS</p><h2>예약 학습 자료</h2></div><p>{sortedMaterials.length}개 도착 <Marker /></p></summary>
          <div className="accordion-body">
            {loading ? <div className="empty-state material-empty">예약 자료를 불러오는 중...</div> : sortedMaterials.length ? <div className="materials-grid">
              {sortedMaterials.map((material) => {
                const meta = materialKind[material.kind];
                const payload = readPayload(material.body);
                const audioAssets = material.assets.filter((asset) => asset.contentType.startsWith('audio/'));
                const canListen = Boolean(payload) && (material.kind === 'english' || material.kind === 'japanese');
                const language = canListen ? speechLanguage(material) : 'en-US';
                const listen = listeningState(language);
                const explanationReady = voiceStatus === 'ready' && Boolean(selectedVoice('ko-KR'));
                const examplesPlaying = speakingAction?.materialId === material.id && speakingAction.key === 'examples';
                return (
                  <details className={`material-card ${material.kind} ${focusedMaterialId === material.id ? 'is-focused' : ''}`} id={`material-${material.id}`} open={focusedMaterialId === material.id || undefined} key={material.id}>
                    <summary className="material-card-summary"><div><span className="material-kind">{meta.label}</span><small>{material.status === 'completed' ? '완료' : material.status === 'in_progress' ? '학습 중' : meta.description}</small></div><strong>{material.title}</strong><span>{payload?.items.length ?? 0}개 <Marker /></span></summary>
                    <div className="material-card-body"><p className="material-summary">{material.summary}</p>
                      <div className="material-actions">
                        {canListen && payload && <button className="listen-button" disabled={listen.disabled} title={listen.label || undefined} onClick={() => speakExamples(material, payload)} aria-pressed={examplesPlaying}><span aria-hidden="true">{examplesPlaying ? '■' : '▶'}</span>{examplesPlaying ? ' 듣기 멈추기' : ` ${listen.label || exampleLabel(language)}`}</button>}
                        {material.status === 'ready' && <button onClick={() => void startMaterial(material)}>학습 시작</button>}
                        <button onClick={() => openCompletion({ type: 'material', id: material.id, title: material.title, part: meta.part, minutes: meta.minutes, date: selectedDate })}>{material.status === 'completed' ? '완료 기록 수정' : '학습 완료 기록'}</button>
                      </div>
                      {canListen && <p className="listen-help">{listen.label || '예문은 목표 언어로만 읽고, 문제·선택지·해설 듣기를 따로 선택할 수 있어요.'}</p>}
                      {payload?.speakingSentence && <div className="speaking-block"><span>말하기 한 문장</span><strong lang={meta.language}>{payload.speakingSentence}</strong>{payload.speakingMeaning && <p>{payload.speakingMeaning}</p>}</div>}
                      {audioAssets.map((asset) => <figure className="material-audio" key={asset.id}><figcaption>듣기 자료 · {asset.filename}</figcaption><audio controls preload="none" src={asset.url}>오디오를 재생할 수 없는 브라우저입니다.</audio></figure>)}
                      {payload?.items.length ? <div className="material-items">{payload.items.map((item, index) => {
                        const sentencePlaying = speakingAction?.materialId === material.id && speakingAction.key === `item-${index}-sentence`;
                        const questionPlaying = speakingAction?.materialId === material.id && speakingAction.key === `item-${index}-question`;
                        const explanationPlaying = speakingAction?.materialId === material.id && speakingAction.key === `item-${index}-explanation`;
                        const quizKey = `${material.id}:${index}`;
                        const quizAnswer = quizAnswers[quizKey];
                        const correctLabel = material.kind === 'toeic' && item.options?.length === 4 ? correctOptionLabel(item.answer) : null;
                        if (correctLabel && item.options) {
                          const isCorrect = quizAnswer?.correct === true;
                          const promptId = `quiz-prompt-${material.id}-${index}`;
                          return <article className="material-item quiz-item" id={`quiz-${material.id}-${index}`} tabIndex={-1} key={quizKey}>
                            <header><span>{String(index + 1).padStart(2, '0')}</span><small>하나를 선택하세요</small></header>
                            <strong className="quiz-prompt" id={promptId} lang="en">{item.prompt}</strong>
                            <div className="quiz-options" role="radiogroup" aria-labelledby={promptId}>
                              {item.options.map((option) => {
                                const chosen = quizAnswer?.selectedLabel === option.label;
                                const answer = option.label === correctLabel;
                                const revealed = quizAnswer?.saved;
                                const className = !revealed && chosen ? 'is-selected' : revealed && chosen ? (answer ? 'is-correct' : 'is-wrong') : revealed && answer ? 'is-answer' : '';
                                const resultLabel = revealed && answer ? '정답' : revealed && chosen ? '틀림' : '';
                                return <button type="button" role="radio" key={option.label} disabled={Boolean(quizAnswer)} className={className} aria-checked={chosen} onClick={() => void chooseQuizOption(material, item, index, option.label)}>
                                  <b>{option.label}</b><span lang="en">{option.text}</span>{resultLabel && <i>{resultLabel}</i>}
                                </button>;
                              })}
                            </div>
                            {quizAnswer?.saving && <div className="quiz-result pending" role="status" aria-live="polite"><strong>정답을 확인하고 있습니다.</strong></div>}
                            {quizAnswer?.failed && <div className="quiz-result wrong" role="status" aria-live="polite">
                              <strong>정답을 확인하지 못했습니다.</strong><small>연결 상태를 확인한 뒤 같은 답으로 다시 시도해 주세요.</small>
                              <div className="quiz-result-actions"><button type="button" onClick={() => void chooseQuizOption(material, item, index, quizAnswer.selectedLabel, true)}>저장 다시 시도</button></div>
                            </div>}
                            {quizAnswer?.saved && <div className={`quiz-result ${isCorrect ? 'correct' : 'wrong'}`} role="status" aria-live="polite">
                              <strong>{isCorrect ? '맞았습니다.' : `틀렸습니다. 정답은 ${correctLabel}입니다.`}</strong>
                              <p><b>정답</b>{item.answer}</p>
                              {item.explanation && <p><b>해설</b>{item.explanation}</p>}
                              {!isCorrect && <small>오답노트에 저장했습니다.</small>}
                            </div>}
                          </article>;
                        }
                        return <details className={`material-item ${isSpeaking(material.id, `item-${index}-prompt`) ? 'is-speaking' : ''}`} key={`${material.id}-${index}`}><summary><span>{String(index + 1).padStart(2, '0')}</span><div><strong lang={meta.language}>{item.prompt}</strong></div></summary>
                          {canListen && <div className="material-item-actions">
                            {item.options?.length ? <button disabled={listen.disabled} onClick={() => speakQuestion(material, item, index)} aria-pressed={questionPlaying}>{questionPlaying ? '듣기 멈추기' : '문제 전체 듣기'}</button> : null}
                            <button disabled={listen.disabled} onClick={() => speakSentence(material, item, index)} aria-pressed={sentencePlaying}>{sentencePlaying ? '듣기 멈추기' : item.options?.length ? '문장만 듣기' : '문장 듣기'}</button>
                          </div>}
                          {item.options && <ol className="material-options">{item.options.map((option) => <li className={isSpeaking(material.id, `item-${index}-option-${option.label}`) ? 'is-speaking' : ''} key={option.label}><b>{option.label}</b><span>{option.text}</span>{canListen && <button disabled={listen.disabled} onClick={() => speakOption(material, option, index)} aria-pressed={speakingAction?.materialId === material.id && speakingAction.key === `item-${index}-option-${option.label}`}>{speakingAction?.materialId === material.id && speakingAction.key === `item-${index}-option-${option.label}` ? '멈추기' : `${option.label} 듣기`}</button>}</li>)}</ol>}
                          <div className={`material-answer ${isSpeaking(material.id, `item-${index}-explanation`) ? 'is-speaking' : ''}`}><div><span>정답</span><p>{item.answer}</p></div>{item.explanation && <div><span>설명</span><p>{item.explanation}</p></div>}{canListen && <button className="explanation-listen" disabled={!explanationReady} title={explanationReady ? undefined : voiceStatus === 'preparing' ? '한국어 음성 준비 중…' : '한국어 음성 없음'} onClick={() => speakExplanation(material, item, index)} aria-pressed={explanationPlaying}>{explanationPlaying ? '해설 듣기 멈추기' : explanationReady ? '해설 듣기' : voiceStatus === 'preparing' ? '해설 음성 준비 중…' : '해설 음성 없음'}</button>}</div>
                        </details>;
                      })}</div> : <p className="material-unavailable">상세 학습 내용은 준비 중이에요.</p>}
                    </div>
                  </details>
                );
              })}
            </div> : <div className="empty-state material-empty"><strong>이 날짜에 도착한 예약 학습 자료가 없어요.</strong><span>영어, 일본어, TOEIC 자료가 도착하면 여기에 모아 보여드려요.</span></div>}
          </div>
        </details>

        <section className="mistake-section" aria-labelledby="mistake-title">
          <header className="mistake-heading">
            <div><p className="mini-label">TOEIC WRONG ANSWERS</p><h2 id="mistake-title">TOEIC 오답노트</h2><p>틀린 문제만 모아 두고, 다시 맞히면 목록에서 해결됩니다.</p></div>
            <strong>{quizMistakes.length}개</strong>
          </header>
          {quizMistakes.length ? <div className="mistake-list">{quizMistakes.map((mistake) => {
            const mistakeKey = mistake.id;
            const answerState = mistakeAnswers[mistakeKey];
            const isCorrect = answerState?.correct === true;
            const promptId = `mistake-prompt-${mistake.id}`;
            return <details className="mistake-card" key={mistake.id}>
              <summary>
                <div><span>{formatShort(mistake.materialDate)} · {mistake.itemIndex + 1}번</span><strong>{mistake.prompt}</strong><small>최근 오답 {mistake.selectedLabel} · 누적 {mistake.attempts}회</small></div>
                <Marker />
              </summary>
              <div className="mistake-card-body">
                <strong className="quiz-prompt" id={promptId} lang="en">{mistake.prompt}</strong>
                <div className="quiz-options" role="radiogroup" aria-labelledby={promptId}>
                  {mistake.options.map((option) => {
                    const chosen = answerState?.selectedLabel === option.label;
                    const answer = option.label === mistake.correctLabel;
                    const revealed = answerState?.saved;
                    const className = !revealed && chosen ? 'is-selected' : revealed && chosen ? (answer ? 'is-correct' : 'is-wrong') : revealed && answer ? 'is-answer' : '';
                    const resultLabel = revealed && answer ? '정답' : revealed && chosen ? '틀림' : '';
                    return <button type="button" role="radio" key={option.label} disabled={Boolean(answerState)} className={className} aria-checked={chosen} onClick={() => void chooseMistakeOption(mistake, option.label)}>
                      <b>{option.label}</b><span lang="en">{option.text}</span>{resultLabel && <i>{resultLabel}</i>}
                    </button>;
                  })}
                </div>
                {answerState?.saving && <div className="quiz-result pending" role="status" aria-live="polite"><strong>정답을 확인하고 있습니다.</strong></div>}
                {answerState?.saved && <div className={`quiz-result ${isCorrect ? 'correct' : 'wrong'}`} role="status" aria-live="polite">
                  <strong>{isCorrect ? '맞았습니다. 오답을 해결하는 중입니다.' : `아직 틀렸습니다. 정답은 ${mistake.correctLabel}입니다.`}</strong>
                  {mistake.explanation && <p><b>해설</b>{mistake.explanation}</p>}
                  <small>결과를 저장했습니다.</small>
                </div>}
                {answerState?.failed && <div className="quiz-result wrong" role="status" aria-live="polite">
                  <strong>정답을 확인하지 못했습니다.</strong><small>연결 상태를 확인한 뒤 같은 답으로 저장을 다시 시도해 주세요.</small>
                </div>}
                <div className="mistake-actions">
                  {answerState?.failed && <button type="button" onClick={() => void chooseMistakeOption(mistake, answerState.selectedLabel, true)}>저장 다시 시도</button>}
                  {answerState?.saved && !isCorrect && <button type="button" onClick={() => retryMistake(mistake)}>다시 풀기</button>}
                  <button type="button" className="subtle" onClick={() => openMistakeMaterial(mistake)}>원래 문제 보기</button>
                </div>
              </div>
            </details>;
          })}</div> : <div className="empty-state mistake-empty"><strong>아직 저장된 TOEIC 오답이 없습니다.</strong><span>TOEIC 문제에서 틀린 문항만 여기에 자동으로 모입니다.</span></div>}
        </section>

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
