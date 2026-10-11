import { CALENDAR_SCOPE, consumeRateLimit, errorCode, getGoogleAccessToken, getSession, originAllowed, readJson, sendJson, validEmail, type ApiRequest, type ApiResponse } from '../../../server/google';

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
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 180) : '';
    const date = typeof body.date === 'string' ? body.date : '';
    const startTime = typeof body.startTime === 'string' ? body.startTime : '';
    const endTime = typeof body.endTime === 'string' ? body.endTime : '';
    const timezone = typeof body.timezone === 'string' ? body.timezone : 'Asia/Manila';
    const location = typeof body.location === 'string' ? body.location.trim().slice(0, 1000) : '';
    const agenda = typeof body.agenda === 'string' ? body.agenda.trim().slice(0, 8000) : '';
    const platform = typeof body.platform === 'string' ? body.platform.trim().slice(0, 100) : '';
    const attendeesRaw = typeof body.inviteEmails === 'string' ? body.inviteEmails : '';
    const attendeeEmails = Array.from(new Set(attendeesRaw.split(/[,\n;]/).map(value => value.trim()).filter(Boolean)));
    const parsedDate = new Date(date + 'T12:00:00Z');
    const validTime = (value: string) => { const match = /^(\d{2}):(\d{2})$/.exec(value); return !value || Boolean(match && Number(match[1]) < 24 && Number(match[2]) < 60); };
    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) return sendJson(res, 400, { error: 'invalid_event_details' });
    if (!validTime(startTime) || !validTime(endTime)) return sendJson(res, 400, { error: 'invalid_event_time' });
    if (startTime && endTime && endTime <= startTime) return sendJson(res, 400, { error: 'end_time_must_follow_start_time' });
    if (attendeeEmails.length > 100 || attendeeEmails.some(email => !validEmail(email))) return sendJson(res, 400, { error: 'invalid_invitee_email' });
    try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }); } catch { return sendJson(res, 400, { error: 'invalid_time_zone' }); }
    const { token } = await getGoogleAccessToken(session.hash, CALENDAR_SCOPE);
    if (!(await consumeRateLimit(session.hash, 'calendar_create', 30))) return sendJson(res, 429, { error: 'rate_limit_exceeded' });
    const description = [platform ? 'Platform: ' + platform : '', agenda].filter(Boolean).join('\n\n');
    const event: Record<string, unknown> = {
      summary: title,
      ...(location ? { location } : {}),
      ...(description ? { description } : {}),
      ...(attendeeEmails.length ? { attendees: attendeeEmails.map(email => ({ email })) } : {})
    };
    const reminderChoice = String(body.reminder ?? 'none');
    if (reminderChoice === 'custom') return sendJson(res, 400, { error: 'custom_reminder_not_supported' });
    const reminderMinutes = ['15', '30', '60'].includes(reminderChoice) ? Number(reminderChoice) : 0;
    if (reminderChoice === 'none') event.reminders = { useDefault: false, overrides: [] };
    else if (reminderMinutes) event.reminders = { useDefault: false, overrides: [{ method: 'popup', minutes: reminderMinutes }] };
    if (startTime || endTime) {
      if (!startTime || !endTime) return sendJson(res, 400, { error: 'both_start_and_end_time_required' });
      event.start = { dateTime: date + 'T' + startTime + ':00', timeZone: timezone };
      event.end = { dateTime: date + 'T' + endTime + ':00', timeZone: timezone };
    } else {
      const nextDate = new Date(Date.parse(date + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
      event.start = { date };
      event.end = { date: nextDate };
    }
    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    });
    if (!response.ok) {
      if (response.status === 401) return sendJson(res, 401, { error: 'google_reauthorization_required' });
      return sendJson(res, 502, { error: 'google_calendar_request_failed' });
    }
    const created = await response.json() as Record<string, unknown>;
    return sendJson(res, 201, { id: created.id, htmlLink: created.htmlLink, status: created.status, summary: created.summary });
  } catch (error) {
    return sendJson(res, 503, { error: errorCode(error) });
  }
}
