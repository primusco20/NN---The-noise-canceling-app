# NN — The Noise Canceling App

Production domain: https://nn.nasrinai.com

NN is a separate, privacy-first web app for microphone checks, meeting organization, notes, and chat drafts.

## Current workspace features

- **Navigation:** Home, Calendar, Meetings, Notes, Chats, and Settings, plus a menu action to return to Home from any section.
- **Microphone check:** Explicit permission request, browser-native noise suppression / echo cancellation / automatic gain control when supported, and a local input-level meter.
- **Calendar:** Browse a responsive monthly calendar, jump to today, select a date, see scheduled meetings, and create events that are also listed in Meetings.
- **Meetings:** Create, search, review, and delete meeting records with date, start/end time, time zone, platform, location or meeting link, attendee names, invitee email addresses, reminder preference, and agenda. Open a meeting's associated notes. All records remain local; invite delivery, calendar writes, and reminder notifications are not connected yet.
- **Team & Clients:** Add and remove Team, Client, or Other contacts with first/last name, email, optional phone, email-provider preference, and meeting-platform preference. Contact data is stored locally in the browser.
- **Notes:** Create and edit notes with automatic local saving and delete controls.
- **Chats:** Save local message drafts and use prompt starters. This is a local draft area, not an AI chat service; it does not generate assistant responses.
- **Quick tools:** A floating launcher offers shortcuts to the microphone meter and local note creation. Captions and NasrinAI connection actions explicitly report that they are not enabled; they do not upload audio or claim to be connected.
- **Settings:** Audio preferences, light/dark/system appearance, Orange/Charcoal/Galaxy color palettes, JSON export, and deletion of local workspace data.
- **Integration directory:** Google Gmail and Google Calendar have server-side OAuth routes and explicit email/event actions; those require the setup above before they can be used. Outlook/Microsoft 365, Yahoo Mail, Apple Mail/iCloud Mail, generic IMAP/SMTP, Slack, Google Meet, Teams, and Zoom remain placeholders.
- **Local-first data:** Meetings, contacts, notes, chats, and preferences are stored in this browser's localStorage. There is no account, cloud sync, transcription upload, or server-side persistence in this milestone.

## Run locally

Requirements: Node.js 20+ and a current browser. Microphone access generally requires HTTPS or `localhost`.

```bash
npm install
npm run dev
npm run typecheck
npm run build
```

## Privacy and security

- The microphone signal is analyzed locally for the level meter only; it is not recorded, uploaded, or routed to speakers by this prototype.
- Browser audio constraints are best-effort requests and may not be supported uniformly. Verify actual browser settings and test across target devices.
- **Local AI denoising is not implemented yet.** The current app requests native browser noise suppression only.
- LocalStorage is not encrypted storage and may be removed by the browser or anyone with access to the same browser profile. Do not store sensitive meeting content on shared devices.
- JSON export includes workspace content. Keep the downloaded export secure.
- Never put cloud provider API keys in client-side code. Cloud transcription and summaries require server-side provider adapters, clear disclosure, and explicit consent before audio upload.
- Before adding cloud storage, use private records/buckets, least-privilege access, retention controls, and a tested deletion path.
- Optional NasrinAI integration must remain separate and require an explicit user action and clear permission.

## Integration security and current limitations

- The Integrations settings page does not connect accounts yet. Its Connect buttons explain the setup requirements and do not open provider authorization or access user data.
- Gmail/Google Meet require Google OAuth consent and API scopes; Outlook/Microsoft 365 and Teams require Microsoft identity/app registration and Graph permissions; Yahoo Mail needs an approved authorization/API approach; Zoom and Slack each require their own OAuth apps and scopes.
- Apple Mail is a client rather than one universal email service. Connection support depends on the underlying account provider (for example iCloud Mail, Microsoft 365, or a supported IMAP server). Generic IMAP/SMTP support must be implemented server-side with secure credential/token handling and provider-specific restrictions.
- Before enabling any live integration, add server-side OAuth start/callback routes, CSRF/state validation, encrypted token storage, least-privilege scopes, disconnect/revocation, privacy disclosures, and tests. Never collect email passwords or provider API secrets in browser UI code.
- Google Meet, Teams, and Zoom meeting links can be stored as ordinary meeting details today, but importing meetings, reading transcripts, joining calls, or processing call audio requires separate platform permissions and APIs. A browser page cannot become a system-wide virtual microphone by itself.

## Google OAuth integration (code added; deployment setup still required)

Google account linking is implemented as server-side Vercel API routes, but it will not work until the Google Cloud OAuth client, Supabase migration, and Vercel environment variables below are configured. Those production settings have not been changed by this code change.

### OAuth security model

- Google authorization-code flow uses PKCE (S256), a one-time random state value, a ten-minute OAuth transaction expiry, and an exact HTTPS callback URL.
- Gmail and Google Calendar ask for permissions separately, only when the user selects Connect for that service. Identity uses openid email; Gmail requests only https://www.googleapis.com/auth/gmail.send, and Calendar requests only https://www.googleapis.com/auth/calendar.events.owned. Calendar event creation sends invitation updates through Google Calendar.
- The opaque browser-session cookie is Secure, HttpOnly, SameSite=Lax, and host-only. The database stores only a SHA-256 hash of the session cookie and OAuth state. Google access and refresh tokens are encrypted with AES-256-GCM before they are written to Supabase.
- Supabase tables have RLS enabled and no access for anon or authenticated; only server-side service-role requests can access them. The service-role key, Google client secret, and token-encryption key must exist only in server-side Vercel environment variables. Never use a VITE_ prefix for these values.
- Server-side rolling-hour limits are 20 Gmail sends and 30 Calendar event creations per browser session. Disconnect removes the stored token and requests Google token revocation.
- The current app has no NN user-account system. Google connections are bound to the browser's opaque NN session cookie, not to a signed-in NN identity. Clearing that cookie loses the browser binding; use Disconnect before clearing site data.
- The app's existing meetings, contacts, and notes remain in localStorage. Connecting Google does not upload that local workspace automatically.

### Setup required before enabling the integration

1. In Google Cloud, configure the OAuth consent screen and create an OAuth client of type Web application. Add the exact authorized redirect URI https://nn.nasrinai.com/api/google/callback. Enable the Gmail API and Google Calendar API. Add test users while the consent screen is in testing; Google may require verification before general use.
2. Review and manually apply supabase/migrations/202610120001_google_oauth.sql to the intended Supabase project. The migration has not been executed by this code change.
3. Add these server-side Vercel environment variables for the intended environment:
   - NN_APP_ORIGIN=https://nn.nasrinai.com
   - GOOGLE_REDIRECT_URI=https://nn.nasrinai.com/api/google/callback
   - GOOGLE_CLIENT_ID
   - GOOGLE_CLIENT_SECRET
   - GOOGLE_TOKEN_ENCRYPTION_KEY — a base64-encoded 32-byte key; generate a new one with openssl rand -base64 32
   - SUPABASE_URL
   - SUPABASE_SERVICE_ROLE_KEY — service role only; never send it to the browser
4. Keep the encryption key stable while tokens are stored. Rotating it without re-encrypting existing tokens makes those tokens unreadable and requires users to reconnect.
5. After the environment and migration are configured, validate OAuth consent, connect/disconnect, Gmail sending, Calendar event creation/invite delivery, token refresh, rate limits, expired sessions, and revocation in a non-production test environment before any production release.

### Implemented server routes

- POST /api/google/connect — starts the Gmail or Calendar OAuth flow.
- GET /api/google/callback — validates state/PKCE, exchanges the code server-side, verifies the Google email, and stores encrypted tokens.
- GET /api/google/status and POST /api/google/disconnect — report non-secret connection status and disconnect/revoke.
- POST /api/google/gmail/send — sends plain-text email from the connected Gmail account after an explicit user action.
- POST /api/google/calendar/events — creates a primary-calendar event, sends attendee updates, and applies supported 15/30/60-minute popup reminders.

These routes are not proof that the live Google app or production database is configured. Do not deploy or apply the migration until the settings and validation are reviewed.

## Planned sequence

1. Validate the Team/Client and expanded event workflow, including keyboard/mobile behavior and local data handling.
2. Add a tested local AI denoising model through an AudioWorklet/WASM pipeline; benchmark quality, latency, CPU, and clipping. Browser-native suppression remains best-effort and is not full AI removal.
3. Add opt-in captions/transcription and meeting summaries with clear disclosure, consent, and validated browser/provider behavior.
4. Implement secure OAuth-backed calendar/email integrations so invitees can actually receive email and calendar invitations; local records alone do not send invitations or add events to invitees' calendars.
5. Add user-selected local/cloud notes storage with export, retention, and deletion.
6. Add optional NasrinAI integration behind explicit consent.
7. Run type checks, production builds, browser compatibility, security, accessibility, and privacy QA.

## Product limitation

A normal browser app can process audio captured by this app. It cannot automatically act as a system-wide virtual microphone or replace audio inside Zoom, Teams, or Meet without additional platform-specific work.
