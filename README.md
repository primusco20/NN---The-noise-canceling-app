# NN — The Noise Canceling App

Production domain: https://nn.nasrinai.com

NN is a separate, privacy-first web app for microphone checks, meeting organization, notes, and chat drafts.

## Current workspace features

- **Navigation:** Home, Calendar, Meetings, Notes, Chats, and Settings, plus a menu action to return to Home from any section.
- **Microphone check:** Explicit permission request, browser-native noise suppression / echo cancellation / automatic gain control when supported, and a local input-level meter.
- **Calendar:** Browse a responsive monthly calendar, jump to today, select a date, see scheduled meetings, and create events that are also listed in Meetings.
- **Meetings:** Create, search, review, and delete meeting records with a date, attendees, and agenda. Open a meeting's associated notes.
- **Notes:** Create and edit notes with automatic local saving and delete controls.
- **Chats:** Save local message drafts and use prompt starters. This is a local draft area, not an AI chat service; it does not generate assistant responses.
- **Settings:** Audio preferences, light/dark/system appearance, Orange/Charcoal/Galaxy color palettes, JSON export, and deletion of local workspace data.
- **Integration directory:** Setup cards for Gmail, Outlook/Microsoft 365, Yahoo Mail, Apple Mail/iCloud Mail, generic IMAP/SMTP, Slack, Google Meet, Microsoft Teams, and Zoom. These are integration placeholders; account authorization and live data sync are not implemented until secure provider OAuth/API backends are configured.
- **Local-first data:** Meetings, notes, chats, and preferences are stored in this browser's localStorage. There is no account, cloud sync, transcription upload, or server-side persistence in this milestone.

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

## Planned sequence

1. Improve and validate the local workspace foundation.
2. Add a tested local AI denoising model through an AudioWorklet/WASM pipeline; benchmark quality, latency, CPU, and clipping.
3. Add explicit opt-in cloud transcription and meeting summaries.
4. Add user-selected local/cloud notes storage with export, retention, and deletion.
5. Add optional NasrinAI integration behind explicit consent.
6. Run type checks, production builds, browser compatibility, security, accessibility, and privacy QA.

## Product limitation

A normal browser app can process audio captured by this app. It cannot automatically act as a system-wide virtual microphone or replace audio inside Zoom, Teams, or Meet without additional platform-specific work.
