import { errorCode, getSession, sendJson, type ApiRequest, type ApiResponse } from '../_lib/google';

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'method_not_allowed' });
  }
  try {
    const session = await getSession(req);
    if (!session) return sendJson(res, 200, { connected: false, gmailConnected: false, calendarConnected: false });
    const { connectionForSession } = await import('../_lib/google');
    const connection = await connectionForSession(session.hash);
    const scopes = connection && Array.isArray(connection.scopes) ? connection.scopes as string[] : [];
    const gmailConnected = scopes.includes('https://www.googleapis.com/auth/gmail.send');
    const calendarConnected = scopes.includes('https://www.googleapis.com/auth/calendar.events.owned');
    return sendJson(res, 200, {
      connected: Boolean(connection),
      email: connection && typeof connection.google_email === 'string' ? connection.google_email : null,
      gmailConnected,
      calendarConnected
    });
  } catch (error) {
    return sendJson(res, 503, { error: errorCode(error) });
  }
}
