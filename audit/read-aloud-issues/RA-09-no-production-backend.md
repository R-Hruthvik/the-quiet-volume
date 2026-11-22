---
id: RA-09
title: No production TTS endpoint; dev middleware only
severity: high
type: bug
area: infra
status: open
---

# RA-09 — No production TTS endpoint; dev middleware only

## Problem

The client calls `/api/tts/speak`, but that route exists only as Vite dev middleware. A static production build has no equivalent endpoint, so every AI voice request fails.

## Evidence

- `src/lib/tts.ts:202-210` — client posts to `/api/tts/speak`.
- `vite.config.ts:14-112` — route implemented inside `configureServer`.
- `audit/issues.md:104-108` — existing BE1: no production TTS backend.

## Impact

AI read-aloud and saved chapter generation cannot work in production. Failures currently degrade silently to WebSpeech.

## Fix direction

- Add a serverless function or small server with the same contract.
- Keep provider keys server-side.
- Add auth or rate limiting if the endpoint is public.
- If production is static-only, gate AI voices and state the limitation in the UI.

## Acceptance criteria

- [ ] A production build can generate audio for Deepgram and ElevenLabs.
- [ ] Provider keys never reach the browser.
- [ ] Missing backend produces a visible error, not a silent voice change.
