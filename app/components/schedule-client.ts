export async function scheduleGet<T>(query: URLSearchParams, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/dashboard/schedule?${query}`, { cache: 'no-store', signal });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || '일정을 불러오지 못했습니다.');
  return data;
}
export async function schedulePost(body: Record<string, unknown>, receipts: Map<string, string>) {
  const key = JSON.stringify(body), requestId = receipts.get(key) ?? `schedule:${crypto.randomUUID()}`;
  receipts.set(key, requestId);
  const response = await fetch('/api/dashboard/schedule', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, requestId }) });
  const data = await response.json() as { error?: string; ok: boolean; nextDue: string };
  if (!response.ok) throw new Error(data.error || '저장하지 못했습니다. 다시 시도해 주세요.');
  receipts.delete(key);
  return data;
}
