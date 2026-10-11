import { appRedirect, connectionForSession, encryptSecret, exchangeGoogleCode, getSession, googleUserInfo, parseUrl, saveConnection, sha256Hex, updateSession, type ApiRequest, type ApiResponse } from '../../server/google';

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'GET') return res.redirect(302, '/?google=method-not-allowed');
  try {
    const url = parseUrl(req);
    const oauthError = url.searchParams.get('error');
    if (oauthError) return appRedirect(res, oauthError === 'access_denied' ? 'cancelled' : 'failed');
    const code = url.searchParams.get('code') ?? '';
    const state = url.searchParams.get('state') ?? '';
    if (!code || !state) return appRedirect(res, 'failed');
    const session = await getSession(req);
    if (!session) return appRedirect(res, 'session-expired');
    const stored = session.row;
    const stateHash = typeof stored.oauth_state_hash === 'string' ? stored.oauth_state_hash : '';
    const verifier = typeof stored.pkce_verifier === 'string' ? stored.pkce_verifier : '';
    const service = stored.oauth_service === 'gmail' || stored.oauth_service === 'calendar' ? stored.oauth_service : '';
    const expiresAt = typeof stored.oauth_expires_at === 'string' ? Date.parse(stored.oauth_expires_at) : 0;
    if (!stateHash || !verifier || !service || expiresAt <= Date.now() || stateHash !== await sha256Hex(state)) return appRedirect(res, 'invalid-state');
    await updateSession(session.hash, { oauth_state_hash: null, pkce_verifier: null, oauth_service: null, oauth_expires_at: null });
    const token = await exchangeGoogleCode(code, verifier);
    if (typeof token.access_token !== 'string') return appRedirect(res, 'failed');
    const identity = await googleUserInfo(token.access_token);
    const previous = await connectionForSession(session.hash);
    const previousRefresh = previous && typeof previous.refresh_token_enc === 'string' ? previous.refresh_token_enc : '';
    const refreshToken = typeof token.refresh_token === 'string' && token.refresh_token ? token.refresh_token : previousRefresh;
    if (!refreshToken) return appRedirect(res, 'refresh-token-missing');
    const oldScopes = previous && Array.isArray(previous.scopes) ? previous.scopes as string[] : [];
    const tokenScopes = typeof token.scope === 'string' ? token.scope.split(/\s+/).filter(Boolean) : [];
    const requestedScope = service === 'gmail' ? 'https://www.googleapis.com/auth/gmail.send' : 'https://www.googleapis.com/auth/calendar.events.owned';
    if (!tokenScopes.includes(requestedScope) && !oldScopes.includes(requestedScope)) return appRedirect(res, 'scope-missing');
    const scopes = Array.from(new Set([...oldScopes, ...tokenScopes, 'openid', 'email', requestedScope]));
    await saveConnection({
      session_hash: session.hash,
      google_email: identity.email,
      scopes,
      access_token_enc: await encryptSecret(token.access_token),
      refresh_token_enc: typeof token.refresh_token === 'string' && token.refresh_token ? await encryptSecret(token.refresh_token) : previousRefresh,
      access_expires_at: new Date(Date.now() + Number(token.expires_in ?? 3600) * 1000).toISOString(),
      updated_at: new Date().toISOString()
    });
    return appRedirect(res, service + '-connected');
  } catch (error) {
    return appRedirect(res, 'failed');
  }
}

