import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export type DashboardAuthConfig = {
  adminToken?: unknown;
  accessTeamDomain?: unknown;
  accessAud?: unknown;
};

export type AccessIdentity = {
  email: string;
};

type AccessVerificationKey = JWTVerifyGetKey | CryptoKey | Uint8Array;

const encoder = new TextEncoder();
const remoteKeySets = new Map<string, JWTVerifyGetKey>();

function accessIssuer(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function accessAudience(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{16,256}$/.test(value) ? value : null;
}

function remoteKeySet(issuer: string): JWTVerifyGetKey {
  const existing = remoteKeySets.get(issuer);
  if (existing) return existing;
  const created = createRemoteJWKSet(new URL('/cdn-cgi/access/certs', issuer));
  remoteKeySets.set(issuer, created);
  return created;
}

export async function verifyAdminToken(supplied: unknown, configured: unknown): Promise<boolean> {
  if (typeof supplied !== 'string' || typeof configured !== 'string' || !supplied || !configured) return false;
  const [expectedHash, suppliedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(configured)),
    crypto.subtle.digest('SHA-256', encoder.encode(supplied)),
  ]);
  const expectedBytes = new Uint8Array(expectedHash);
  const suppliedBytes = new Uint8Array(suppliedHash);
  let difference = 0;
  for (let index = 0; index < expectedBytes.length; index += 1) {
    difference |= expectedBytes[index] ^ suppliedBytes[index];
  }
  return difference === 0;
}

export function bearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice(7).trim();
  return token && token.length <= 1024 ? token : null;
}

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function verifyAccessIdentity(
  request: Request,
  config: Pick<DashboardAuthConfig, 'accessTeamDomain' | 'accessAud'>,
  verificationKey?: AccessVerificationKey,
): Promise<AccessIdentity | null> {
  const issuer = accessIssuer(config.accessTeamDomain);
  const audience = accessAudience(config.accessAud);
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!issuer || !audience || !token || token.length > 16384) return null;

  try {
    const key = verificationKey ?? remoteKeySet(issuer);
    const { payload } = typeof key === 'function'
      ? await jwtVerify(token, key, { issuer, audience })
      : await jwtVerify(token, key, { issuer, audience });
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    return email && email.length <= 320 ? { email } : null;
  } catch {
    return null;
  }
}

export async function isAuthorizedDashboardMutation(
  request: Request,
  config: DashboardAuthConfig,
  verificationKey?: AccessVerificationKey,
): Promise<boolean> {
  const bearer = bearerToken(request);
  if (bearer && await verifyAdminToken(bearer, config.adminToken)) return true;
  if (!isSameOriginRequest(request)) return false;
  return Boolean(await verifyAccessIdentity(request, config, verificationKey));
}
