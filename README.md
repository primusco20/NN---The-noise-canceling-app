# NN — The Noise Canceling App

A separate web app for cleaner meeting audio and, in later phases, meeting transcription and notes.

## Current milestone: audio foundation

- Explicit-click microphone permission request.
- Browser-native noise suppression, echo cancellation, and automatic gain control constraints.
- Local live input-level meter and start/stop cleanup.
- No recording or audio upload in this prototype.

## Run locally

Requirements: Node.js 20+ and a current browser. Microphone access generally requires HTTPS or `localhost`.

```bash
npm install
npm run dev
npm run typecheck
npm run build
```

## Privacy and security

- This prototype does not record, upload, or persist microphone audio. The microphone signal is analyzed locally for a level meter only and is not routed to speakers.
- Browser audio constraints may not be supported uniformly; test on target browsers and devices.
- The local AI denoising model and AudioWorklet are **not implemented yet**. Validate quality, latency, CPU use, clipping, and model/runtime licensing before shipping a model.
- Never expose cloud provider API keys in client-side code. Add server-side adapters for transcription and summaries.
- Cloud transcription sends audio to the selected provider even if saved notes are stored locally. Explain this clearly and obtain consent before upload.
- When storage is added, use private records/buckets, least-privilege access, retention controls, and a tested deletion path.

## Planned sequence

1. Audio capture and native fallback (current milestone).
2. Local AI denoising using a tested WASM model and AudioWorklet.
3. Explicit opt-in cloud transcription and summaries.
4. User-selected local/cloud notes storage.
5. Optional NasrinAI integration with explicit user action and separate permissions.
6. Browser compatibility, security, accessibility, and privacy QA.

## Product limitation

A normal browser app can process audio captured by this app. It cannot automatically act as a system-wide virtual microphone or replace audio inside Zoom, Teams, or Meet without additional platform-specific work.
