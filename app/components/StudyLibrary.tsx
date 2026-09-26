'use client';

import { FormEvent, useEffect, useState } from 'react';

type Material = { id: string; date: string; kind: 'english' | 'japanese' | 'toeic'; title: string; summary: string; status: string; createdAt: string; assetCount: number; openPath: string };
type Batch = { id: string; backlogCount: number; replacedTodayCount: number; totalMinutes: number; reason: string; createdAt: string; restoredAt: string | null; archivedCount: number; canRestore: boolean };
type Payload = { library: { items: Material[]; total: number; counts: { byKind: Record<string, number>; byStatus: Record<string, number> } }; archiveBatches: Batch[] };
type Filters = { kind: string; status: string; search: string; from: string; to: string };

const initialFilters: Filters = { kind: 'all', status: 'all', search: '', from: '', to: '' };
const kindLabel: Record<string, string> = { english: '영어', japanese: '일본어', toeic: 'TOEIC' };
const statusLabel: Record<string, string> = { ready: '새 자료', in_progress: '학습 중', completed: '완료' };

async function errorText(response: Response) {
  const raw = (await response.text()).slice(0, 400);
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } | string };
    return typeof parsed.error === 'string' ? parsed.error : parsed.error?.message ?? raw;
  } catch { return raw || `HTTP ${response.status}`; }
}

async function fetchLibrary(filters: Filters) {
  const params = new URLSearchParams({ kind: filters.kind, status: filters.status, limit: '24' });
  if (filters.search) params.set('search', filters.search);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  const response = await fetch(`/api/dashboard/library?${params}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(await errorText(response));
  return response.json() as Promise<Payload>;
}

export default function StudyLibrary({ canEdit, onOpen }: { canEdit: boolean; onOpen: (date: string, materialId: string) => void }) {
  const [draft, setDraft] = useState(initialFilters), [filters, setFilters] = useState(initialFilters);
  const [data, setData] = useState<Payload | null>(null), [loading, setLoading] = useState(true), [busyBatch, setBusyBatch] = useState(''), [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    void fetchLibrary(filters)
      .then(payload => { if (active) setData(payload); })
      .catch(error => { if (active) { setData(null); setMessage(error instanceof Error ? error.message : '자료함을 불러오지 못했습니다.'); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filters]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (draft.from && draft.to && draft.from > draft.to) { setMessage('시작 날짜는 종료 날짜보다 늦을 수 없습니다.'); return; }
    setLoading(true); setMessage(''); setFilters({ ...draft, search: draft.search.trim() });
  }

  async function restore(batch: Batch) {
    if (!canEdit || busyBatch || !batch.canRestore) return;
    if (!window.confirm(`${batch.archivedCount}건을 이 보관 묶음에서 복원할까요? 새 영어·일본어 회차는 그대로 유지됩니다.`)) return;
    setBusyBatch(batch.id); setMessage('');
    try {
      const response = await fetch('/api/dashboard/library', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ batch_id: batch.id, request_id: `library-restore:${crypto.randomUUID()}`, confirmed: true }),
      });
      if (!response.ok) throw new Error(await errorText(response));
      const result = await response.json() as { restoredCount: number };
      setMessage(`${result.restoredCount}건을 복원했습니다.`);
      setData(await fetchLibrary(filters));
    } catch (error) { setMessage(error instanceof Error ? error.message : '보관 묶음을 복원하지 못했습니다.'); }
    finally { setBusyBatch(''); }
  }

  return <details className="accordion-card library-section">
    <summary className="section-heading library-heading"><div><p className="mini-label">STUDY LIBRARY</p><h2>지난 학습 자료함</h2></div><p>{data?.library.total ?? 0}개 찾음 <span className="accordion-marker" aria-hidden="true">⌄</span></p></summary>
    <div className="accordion-body">
      <form className="library-filters" onSubmit={submit}>
        <label>언어<select value={draft.kind} onChange={event => setDraft(current => ({ ...current, kind: event.target.value }))}><option value="all">전체</option><option value="english">영어</option><option value="japanese">일본어</option><option value="toeic">TOEIC</option></select></label>
        <label>상태<select value={draft.status} onChange={event => setDraft(current => ({ ...current, status: event.target.value }))}><option value="all">전체</option><option value="ready">새 자료</option><option value="in_progress">학습 중</option><option value="completed">완료</option></select></label>
        <label className="library-search">검색<input value={draft.search} maxLength={80} placeholder="제목·요약·문장 검색" onChange={event => setDraft(current => ({ ...current, search: event.target.value }))} /></label>
        <label>시작 날짜<input type="date" value={draft.from} onChange={event => setDraft(current => ({ ...current, from: event.target.value }))} /></label>
        <label>종료 날짜<input type="date" value={draft.to} onChange={event => setDraft(current => ({ ...current, to: event.target.value }))} /></label>
        <div className="library-filter-actions"><button disabled={loading}>찾기</button><button type="button" className="subtle" disabled={loading} onClick={() => { setLoading(true); setMessage(''); setDraft(initialFilters); setFilters(initialFilters); }}>초기화</button></div>
      </form>
      {message && <p className="library-message" role="status">{message}</p>}
      {loading ? <p className="empty-state">자료함을 찾는 중…</p> : data?.library.items.length ? <div className="library-grid">{data.library.items.map(item => <article key={item.id} className="library-item"><div><span>{kindLabel[item.kind]} · {item.date}</span><b>{statusLabel[item.status] ?? item.status}</b></div><h3>{item.title}</h3><p>{item.summary || '요약 없음'}</p><small>첨부 {item.assetCount}개</small><button onClick={() => onOpen(item.date, item.id)}>자료 열기</button></article>)}</div> : <p className="empty-state">조건에 맞는 기존 자료가 없습니다.</p>}
      <section className="archive-batches"><h3>보관 묶음</h3><p>묶음 복원은 새 회차와 TOEIC 설정을 바꾸지 않습니다. 날짜별 40분을 넘으면 안전하게 중단됩니다.</p>{data?.archiveBatches.length ? data.archiveBatches.map(batch => <div className="archive-batch" key={batch.id}><div><strong>{new Date(batch.createdAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })} · {batch.backlogCount + batch.replacedTodayCount}건</strong><span>{batch.totalMinutes}분 · 현재 보관 {batch.archivedCount}건</span></div><button disabled={!canEdit || !batch.canRestore || Boolean(busyBatch)} onClick={() => void restore(batch)}>{batch.restoredAt ? '복원 완료' : busyBatch === batch.id ? '복원 중…' : '묶음 복원'}</button></div>) : <p className="empty-state">보관 묶음이 없습니다.</p>}</section>
    </div>
  </details>;
}
