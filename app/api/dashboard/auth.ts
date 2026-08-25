export function isTrustedDashboardMutation(request: Request, configuredSiteUrl: unknown): boolean {
  if (typeof configuredSiteUrl !== 'string' || !configuredSiteUrl.trim()) return false;
  const identity = request.headers.get('oai-authenticated-user-email')?.trim();
  if (!identity || identity.length > 320 || /[\r\n]/.test(identity)) return false;

  try {
    const requestUrl = new URL(request.url);
    const siteUrl = new URL(configuredSiteUrl);
    return requestUrl.protocol === 'https:'
      && siteUrl.protocol === 'https:'
      && requestUrl.host.toLowerCase() === siteUrl.host.toLowerCase();
  } catch {
    return false;
  }
}
