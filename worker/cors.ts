import type { WorkerEnv } from './types.ts';

export function withSiteCors(response: Response, request: Request, env: WorkerEnv): Response {
  const origin = request.headers.get('origin');
  if (!origin || !env.SITE_URL) return response;
  try {
    if (origin !== new URL(env.SITE_URL).origin) return response;
  } catch {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', origin);
  headers.append('vary', 'Origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
