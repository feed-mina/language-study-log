import { bearerToken, verifyAdminToken } from '../../dashboard/auth.ts';

export type IntegrationAuthConfig = {
  integrationToken?: unknown;
  privateOwnerEmail?: unknown;
};

export type IntegrationAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 403 | 503; code: string; message: string };

function normalizedEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email && email.length <= 320 ? email : null;
}

export async function authorizePrivateCycleIntegration(
  request: Request,
  config: IntegrationAuthConfig,
): Promise<IntegrationAuthResult> {
  const configuredOwner = normalizedEmail(config.privateOwnerEmail);
  if (typeof config.integrationToken !== 'string' || !config.integrationToken || !configuredOwner) {
    return { ok: false, status: 503, code: 'INTEGRATION_NOT_CONFIGURED', message: 'Private cycle integration is not configured' };
  }
  if (!(await verifyAdminToken(bearerToken(request), config.integrationToken))) {
    return { ok: false, status: 401, code: 'UNAUTHORIZED', message: 'Valid integration credentials required' };
  }
  const verifiedOwner = normalizedEmail(request.headers.get('x-private-owner-email'));
  if (verifiedOwner !== configuredOwner) {
    return { ok: false, status: 403, code: 'OWNER_MISMATCH', message: 'Verified owner does not match' };
  }
  return { ok: true };
}
