# NN — The Noise Canceling App

Production domain: https://nn.nasrinai.com

NN is a separate, privacy-first web app for microphone checks, meeting organization, notes, and chat drafts.

## Current workspace features

- **Navigation:** Home, Meetings, Notes, Chats, and Settings.
- **Microphone check:** Explicit permission request, browser-native noise suppression / echo cancellation / automatic gain control when supported, and a local input-level meter.
- **Meetings:** Create, search, review, and delete meeting records with a date, attendees, and agenda. Open a meeting's associated notes.
- **Notes:** Create and edit notes with automatic local saving and delete controls.
- **Chats:** Save local message drafts and use prompt starters. This is a local draft area, not an AI chat service; it does not generate assistant responses.
- **Settings:** Audio preferences, dark/light theme, JSON export, and deletion of local workspace data.
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

## Planned sequence

1. Improve and validate the local workspace foundation.
2. Add a tested local AI denoising model through an AudioWorklet/WASM pipeline; benchmark quality, latency, CPU, and clipping.
3. Add explicit opt-in cloud transcription and meeting summaries.
4. Add user-selected local/cloud notes storage with export, retention, and deletion.
5. Add optional NasrinAI integration behind explicit consent.
6. Run type checks, production builds, browser compatibility, security, accessibility, and privacy QA.

## Product limitation

A normal browser app can process audio captured by this app. It cannot automatically act as a system-wide virtual microphone or replace audio inside Zoom, Teams, or Meet without additional platform-specific work.
