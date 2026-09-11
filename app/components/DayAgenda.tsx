import { formatStart, type AgendaItem } from '../schedule-utils';
type Props = { date: string; items: AgendaItem[]; budget: number; canEdit: boolean; busy: boolean; onAdd: () => void; onComplete: (id: string) => void; onUndo: (id: string) => void; onEdit: (item: AgendaItem) => void; onReview: (item: AgendaItem) => void; onCancel: (item: AgendaItem) => void; onOpen: (id: string) => void };
export default function DayAgenda({ date, items, budget, canEdit, busy, onAdd, onComplete, onUndo, onEdit, onReview, onCancel, onOpen }: Props) {
  const total = items.reduce((sum, item) => sum + item.minutes, 0);
  return <section className="day-agenda"><div className="schedule-heading"><div><p className="mini-label">{date}</p><h2>선택한 하루</h2></div><button disabled={!canEdit || busy} onClick={onAdd}>＋ 공부 일정</button></div><p className={total > budget ? 'schedule-warning' : 'schedule-help'}>배정 {total} / 목표 {budget}분 · {total > budget ? `${total - budget}분 많아요. 다른 날짜로 나눠 보세요.` : `${budget - total}분 여유`}</p>
    {!items.length && <p className="empty-state">아직 배정된 공부가 없어요. 일정을 추가하거나 밀린 공부·복습을 배정해 보세요.</p>}
    {items.map(item => <article className="agenda-item" key={item.id}><time>{formatStart(item.start) || '시간 미정'}</time><div className="agenda-copy"><span className={`agenda-tag ${item.type}`}>{item.type === 'review' ? '복습' : item.sourcePlanId ? '재계획' : '새 학습'}</span><strong>{item.type === 'plan' ? <button className="agenda-open" onClick={() => onOpen(item.id)}>{item.title}</button> : `${item.title} · ${item.cardCount}장`}</strong><small>{item.minutes}분 · {item.status === 'completed' ? '완료' : item.type === 'review' ? `${item.reviewedCount}/${item.cardCount}장 평가` : '예정'}</small></div><div className="agenda-actions">
      {item.type === 'plan' ? <button disabled={!canEdit || busy} onClick={() => item.status === 'completed' ? onUndo(item.id) : onComplete(item.id)}>{item.status === 'completed' ? '완료 취소' : '학습 완료 기록'}</button> : <button disabled={busy || !canEdit} onClick={() => onReview(item)}>{item.status === 'completed' ? '복습 결과' : '복습하기'}</button>}
      {item.status === 'planned' && <><button disabled={!canEdit || busy} onClick={() => onEdit(item)}>날짜·시간</button>{item.type === 'review' && <button disabled={!canEdit || busy} onClick={() => onCancel(item)}>배정 취소</button>}</>}
    </div></article>)}
  </section>;
}
