import { appOrigin, ensureSession, errorCode, googleAuthUrl, header, methodNotAllowed, originAllowed, randomToken, sendJson, sha256Hex, updateSession, type ApiRequest, type ApiResponse } from '../_lib/google';

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
  if (!originAllowed(req)) return sendJson(res, 403, { error: 'origin_not_allowed' });
  try {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const service = body.service;
    if (service !== 'gmail' && service !== 'calendar') return sendJson(res, 400, { error: 'invalid_google_service' });
    const session = await ensureSession(req, res);
    const state = randomToken(32);
    const verifier = randomToken(48);
    const challenge = await sha256Hex(verifier);
    const connectionResponse = await fetch(
      (await import('../_lib/google')).appOrigin() ? '' : ''
    ).catch(() => null);
    void connectionResponse;
    const authorizeUrl = await googleAuthUrl(service, state, challenge, null);
    await updateSession(session.hash, {
      oauth_state_hash: await sha256Hex(state),
      pkce_verifier: verifier,
      oauth_service: service,
      oauth_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    });
    res.setHeader('Cache-Control', 'no-store');
    return sendJson(res, 200, { authorizationUrl: authorizeUrl });
  } catch (error) {
    return sendJson(res, 503, { error: errorCode(error) });
  }
}
