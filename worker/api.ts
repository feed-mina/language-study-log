import { deliverContentById, generateAndDeliver } from './content';
import { ensureAutomationSchema, findAsset, insertAsset, listAssets, listContent } from './db';
import { isContentKind, isDate, kstDate, type ContentKind, type ContentRow, type WorkerEnv } from './types';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const ALLOWED_UPLOADS = new Set([
  'audio/mpeg',
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

function json(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

function errorResponse(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, { status });
}

async function authorized(request: Request, env: WorkerEnv): Promise<boolean> {
  const expected = env.ADMIN_TOKEN;
  const authorization = request.headers.get('authorization');
  if (!expected || !authorization?.startsWith('Bearer ')) return false;
  const supplied = authorization.slice(7);
  const [expectedHash, suppliedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(expected)),
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(supplied)),
  ]);
  const expectedBytes = new Uint8Array(expectedHash);
  const suppliedBytes = new Uint8Array(suppliedHash);
  let difference = 0;
  for (let index = 0; index < expectedBytes.length; index += 1) {
    difference |= expectedBytes[index] ^ suppliedBytes[index];
  }
  return difference === 0;
}

function publicContent(row: ContentRow, assets: Awaited<ReturnType<typeof listAssets>>) {
  let body: unknown = null;
  try {
    body = JSON.parse(row.body_json) as unknown;
  } catch {
    body = null;
  }
  return {
    id: row.id,
    date: row.content_date,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    body,
    status: row.status,
    createdAt: row.created_at,
    assets: assets.map((asset) => ({
      id: asset.id,
      kind: asset.kind,
      filename: asset.filename,
      contentType: asset.content_type,
      bytes: asset.bytes,
      url: `/api/assets/${asset.id}`,
    })),
  };
}

async function materials(url: URL, env: WorkerEnv): Promise<Response> {
  const dateValue = url.searchParams.get('date') ?? kstDate();
  const kindValue = url.searchParams.get('kind');
  if (!isDate(dateValue)) return errorResponse(400, 'INVALID_DATE', 'date must use YYYY-MM-DD');
  if (kindValue !== null && !isContentKind(kindValue)) return errorResponse(400, 'INVALID_KIND', 'kind must be english, japanese, or toeic');
  const rows = await listContent(env, dateValue, kindValue ?? undefined);
  const results = await Promise.all(rows.map(async (row) => publicContent(row, await listAssets(env, row.id))));
  return json({ date: dateValue, materials: results });
}

async function assetResponse(request: Request, id: string, env: WorkerEnv): Promise<Response> {
  const asset = await findAsset(env, id);
  if (!asset) return errorResponse(404, 'ASSET_NOT_FOUND', 'Asset not found');
  const object = await env.STUDY_ASSETS.get(asset.r2_key);
  if (!object) return errorResponse(404, 'ASSET_NOT_FOUND', 'Asset object not found');
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'private, max-age=3600');
  headers.set('content-type', asset.content_type);
  headers.set('content-disposition', `inline; filename="${asset.filename.replace(/["\r\n]/g, '')}"`);
  if (request.method === 'HEAD') return new Response(null, { headers });
  return new Response(object.body, { headers });
}

async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (contentLength > 16 * 1024) throw new Error('Request body is too large');
  const value = await request.json() as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON object required');
  return value as Record<string, unknown>;
}

async function generate(request: Request, env: WorkerEnv): Promise<Response> {
  const body = await readJsonObject(request);
  const date = body.date ?? kstDate();
  const kind = body.kind;
  if (!isDate(date)) return errorResponse(400, 'INVALID_DATE', 'date must use YYYY-MM-DD');
  if (!isContentKind(kind)) return errorResponse(400, 'INVALID_KIND', 'kind must be english, japanese, or toeic');
  const result = await generateAndDeliver(env, date, kind, body.sendEmail !== false);
  return json({
    ok: true,
    content: publicContent(result.content, await listAssets(env, result.content.id)),
    delivery: { sent: result.sent, messageId: result.messageId },
  }, { status: 201 });
}

async function sendExisting(contentId: string, env: WorkerEnv): Promise<Response> {
  if (!contentId || contentId.length > 100) return errorResponse(400, 'INVALID_CONTENT_ID', 'Invalid content id');
  const delivery = await deliverContentById(env, contentId);
  return json({ ok: true, delivery });
}

function safeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 120);
}

async function uploadAsset(request: Request, kind: ContentKind, rawFilename: string, url: URL, env: WorkerEnv): Promise<Response> {
  const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (!ALLOWED_UPLOADS.has(contentType)) return errorResponse(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use MP3, PDF, JPEG, PNG, or WebP');
  if (!Number.isFinite(contentLength) || contentLength <= 0 || contentLength > MAX_UPLOAD_BYTES) {
    return errorResponse(413, 'INVALID_FILE_SIZE', 'Content-Length must be between 1 byte and 20 MiB');
  }
  if (!request.body) return errorResponse(400, 'EMPTY_BODY', 'File body is required');

  const filename = safeFilename(rawFilename);
  if (!filename) return errorResponse(400, 'INVALID_FILENAME', 'Filename is invalid');
  const contentId = url.searchParams.get('contentId');
  if (contentId && contentId.length > 100) return errorResponse(400, 'INVALID_CONTENT_ID', 'Invalid content id');

  const id = crypto.randomUUID();
  const date = kstDate();
  const key = `uploads/${date}/${kind}/${id}-${filename}`;
  const object = await env.STUDY_ASSETS.put(key, request.body, {
    httpMetadata: { contentType, contentDisposition: `attachment; filename="${filename}"` },
    customMetadata: { kind, contentId: contentId ?? '' },
  });
  const asset = await insertAsset(env, {
    id,
    content_id: contentId,
    kind: `upload-${kind}`,
    r2_key: key,
    filename,
    content_type: contentType,
    bytes: object.size,
  });
  return json({
    ok: true,
    asset: { id: asset.id, filename: asset.filename, contentType: asset.content_type, bytes: asset.bytes, url: `/api/assets/${asset.id}` },
  }, { status: 201 });
}

export async function handleAutomationApi(request: Request, env: WorkerEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return null;
  if (!url.pathname.startsWith('/api/materials') && !url.pathname.startsWith('/api/assets/') && !url.pathname.startsWith('/api/admin/') && url.pathname !== '/api/health') return null;

  try {
    await ensureAutomationSchema(env);
    if (url.pathname === '/api/health' && request.method === 'GET') {
      const check = await env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>();
      return json({
        ok: check?.ok === 1,
        service: 'language-study-log',
        time: new Date().toISOString(),
        bindings: { d1: true, r2: Boolean(env.STUDY_ASSETS), ai: Boolean(env.AI), email: Boolean(env.EMAIL) },
      });
    }
    if (url.pathname === '/api/materials' && request.method === 'GET') return materials(url, env);

    const assetMatch = url.pathname.match(/^\/api\/assets\/([a-f0-9-]+)$/i);
    if (assetMatch && (request.method === 'GET' || request.method === 'HEAD')) return assetResponse(request, assetMatch[1], env);

    if (url.pathname.startsWith('/api/admin/') && !(await authorized(request, env))) {
      return errorResponse(401, 'UNAUTHORIZED', 'Valid Bearer token required');
    }
    if (url.pathname === '/api/admin/generate' && request.method === 'POST') return generate(request, env);

    const sendMatch = url.pathname.match(/^\/api\/admin\/send\/([a-f0-9-]+)$/i);
    if (sendMatch && request.method === 'POST') return sendExisting(sendMatch[1], env);

    const uploadMatch = url.pathname.match(/^\/api\/admin\/assets\/(english|japanese|toeic)\/([^/]+)$/);
    if (uploadMatch && request.method === 'PUT') {
      return uploadAsset(request, uploadMatch[1] as ContentKind, decodeURIComponent(uploadMatch[2]), url, env);
    }
    return errorResponse(404, 'NOT_FOUND', 'API route not found');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown API error';
    console.error(JSON.stringify({ event: 'api_error', path: url.pathname, method: request.method, message }));
    if (message === 'Study content not found') return errorResponse(404, 'CONTENT_NOT_FOUND', message);
    if (message.includes('JSON') || message.includes('body is too large')) return errorResponse(400, 'INVALID_REQUEST', message);
    return errorResponse(500, 'INTERNAL_ERROR', 'The request could not be completed');
  }
}
