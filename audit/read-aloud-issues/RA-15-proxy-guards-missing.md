---
id: RA-15
title: Dev TTS proxy lacks key, status, and size guards
severity: medium
type: bug
area: security
status: open
---

# RA-15 — Dev TTS proxy lacks key, status, and size guards

## Problem

The dev proxy forwards requests without checking key presence, text length, or upstream status. On a non-2xx upstream response it still writes `audio/mpeg` and pipes the error body, so the client treats an error JSON as audio.

## Evidence

- `vite.config.ts:35-36` — keys read but not validated.
- `vite.config.ts:58-64` — ElevenLabs upstream status is passed through but body is always piped as audio.
- `vite.config.ts:91-97` — same for Deepgram.
- `vite.config.ts:23-27` — body size is unbounded.
- `src/lib/tts.ts:212-218` — client only checks `response.ok`, then reads a blob.

## Impact

Confusing playback failures, avoidable provider cost if the endpoint is exposed, and poor diagnostics.

## Fix direction

- Validate provider and key presence.
- Enforce a text length cap aligned with provider limits.
- On upstream non-2xx, return JSON and do not pipe as audio.
- Pass through 429 with retry guidance.
- Add timeout/abort and a request size limit.

## Acceptance criteria

- [ ] Missing key returns a JSON error with a clear message.
- [ ] Upstream 4xx/5xx never reaches the audio element as MP3.
- [ ] Oversized text is rejected before the upstream call.
- [ ] 429 is surfaced as a retryable error.
