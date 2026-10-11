import { connectionForSession, deleteConnection, decryptSecret, errorCode, getSession, originAllowed, revokeGoogleToken, sendJson, type ApiRequest, type ApiResponse } from '../../server/google';

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'method_not_allowed' });
  }
  if (!originAllowed(req)) return sendJson(res, 403, { error: 'origin_not_allowed' });
  try {
    const session = await getSession(req);
    if (!session) return sendJson(res, 200, { disconnected: true });
    const connection = await connectionForSession(session.hash);
    if (connection) {
      const encrypted = typeof connection.refresh_token_enc === 'string' && connection.refresh_token_enc
        ? connection.refresh_token_enc
        : typeof connection.access_token_enc === 'string' ? connection.access_token_enc : '';
      if (encrypted) {
        try { await revokeGoogleToken(await decryptSecret(encrypted)); } catch { /* Local deletion still proceeds if Google revocation is unavailable. */ }
      }
    }
    await deleteConnection(session.hash);
    return sendJson(res, 200, { disconnected: true });
  } catch (error) {
    return sendJson(res, 503, { error: errorCode(error) });
  }
}
