import { base64UrlText, consumeRateLimit, errorCode, getGoogleAccessToken, getSession, GMAIL_SEND_SCOPE, originAllowed, readJson, sendJson, validEmail, type ApiRequest, type ApiResponse } from '../../../server/google';

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'method_not_allowed' });
  }
  if (!originAllowed(req)) return sendJson(res, 403, { error: 'origin_not_allowed' });
  try {
    const session = await getSession(req);
    if (!session) return sendJson(res, 401, { error: 'google_not_connected' });
    const body = readJson(req);
    const toRaw = Array.isArray(body.to) ? body.to : typeof body.to === 'string' ? body.to.split(/[,\n;]/) : [];
    const recipients = Array.from(new Set(toRaw.map(value => typeof value === 'string' ? value.trim() : '').filter(Boolean)));
    const subject = typeof body.subject === 'string' ? body.subject.trim().replace(/[\r\n]+/g, ' ').slice(0, 240) : '';
    const textBody = typeof body.text === 'string' ? body.text : '';
    if (!recipients.length || recipients.length > 50 || recipients.some(email => !validEmail(email))) return sendJson(res, 400, { error: 'invalid_recipients' });
    if (!subject || !textBody.trim() || textBody.length > 100000) return sendJson(res, 400, { error: 'invalid_message' });
    if (!(await consumeRateLimit(session.hash, 'gmail_send', 20))) return sendJson(res, 429, { error: 'rate_limit_exceeded' });
    const { token } = await getGoogleAccessToken(session.hash, GMAIL_SEND_SCOPE);
    const encodedBody = base64UrlText(textBody);
    const mime = [
      'To: ' + recipients.join(', '),
      'Subject: ' + subject,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      encodedBody
    ].join('\r\n');
    const raw = base64UrlText(mime);
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw })
    });
    if (!response.ok) {
      if (response.status === 401) return sendJson(res, 401, { error: 'google_reauthorization_required' });
      return sendJson(res, 502, { error: 'gmail_send_failed' });
    }
    const result = await response.json() as Record<string, unknown>;
    return sendJson(res, 200, { sent: true, messageId: result.id ?? null, threadId: result.threadId ?? null });
  } catch (error) {
    return sendJson(res, 503, { error: errorCode(error) });
  }
}
