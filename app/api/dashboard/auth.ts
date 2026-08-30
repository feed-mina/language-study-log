const SESSION_COOKIE = '__Host-language-study-admin';
const SESSION_VERSION = 'v1';
const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

const encoder = new TextEncoder();

function base64Url(bytes: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): ArrayBuffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer as ArrayBuffer;
  } catch {
    return null;
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
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

export async function createDashboardSession(adminToken: string, now = Date.now()): Promise<string> {
  const expiresAt = Math.floor(now / 1000) + SESSION_MAX_AGE_SECONDS;
  const payload = `${SESSION_VERSION}.${expiresAt}`;
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(adminToken), encoder.encode(payload));
  return `${payload}.${base64Url(signature)}`;
}

export async function verifyDashboardSession(value: string | null, adminToken: unknown, now = Date.now()): Promise<boolean> {
  if (!value || typeof adminToken !== 'string' || !adminToken) return false;
  const [version, expiresRaw, signatureRaw, extra] = value.split('.');
  if (version !== SESSION_VERSION || extra !== undefined || !/^\d+$/.test(expiresRaw ?? '')) return false;
  const expiresAt = Number(expiresRaw);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now / 1000)) return false;
  const signature = fromBase64Url(signatureRaw ?? '');
  if (!signature || signature.byteLength !== 32) return false;
  return crypto.subtle.verify('HMAC', await hmacKey(adminToken), signature, encoder.encode(`${version}.${expiresRaw}`));
}

function cookieValue(request: Request): string | null {
  const cookie = request.headers.get('cookie');
  if (!cookie) return null;
  for (const entry of cookie.split(';')) {
    const separator = entry.indexOf('=');
    if (separator < 0 || entry.slice(0, separator).trim() !== SESSION_COOKIE) continue;
    return entry.slice(separator + 1).trim();
  }
  return null;
}

export function dashboardSessionCookie(value: string): string {
  return `${SESSION_COOKIE}=${value}; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearDashboardSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Strict`;
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

export async function hasDashboardSession(request: Request, adminToken: unknown, now = Date.now()): Promise<boolean> {
  return verifyDashboardSession(cookieValue(request), adminToken, now);
}

export async function isAuthorizedDashboardMutation(request: Request, adminToken: unknown, now = Date.now()): Promise<boolean> {
  const bearer = bearerToken(request);
  if (bearer && await verifyAdminToken(bearer, adminToken)) return true;
  return isSameOriginRequest(request) && hasDashboardSession(request, adminToken, now);
}
