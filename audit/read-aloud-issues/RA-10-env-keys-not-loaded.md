---
id: RA-10
title: Provider keys not loaded; failures silently fall back to device voice
severity: high
type: bug
area: config
status: open
---

# RA-10 — Provider keys not loaded; failures silently fall back to device voice

## Problem

The Vite middleware reads `process.env.DEEPGRAM_API_KEY` and `process.env.ELEVENLABS_API_KEY`. Vite does not load `.env` into `process.env`, and no `loadEnv` call exists. With empty keys the provider returns 401 and the client silently falls back to WebSpeech.

## Evidence

- `vite.config.ts:35-36` — reads `process.env`.
- `vite.config.ts:8` — `defineConfig(() => ...)` does not load env.
- `.env.example` — documents only `GEMINI_API_KEY` and `APP_URL`.
- `src/lib/tts.ts:239,243-246` — every error falls back to WebSpeech.
- `src/lib/tts.ts:102-104` — `isSpeechSupported` is never called.

## Impact

The app can claim "AI voice" while playing the device voice. No error is shown. Saved-audio generation would silently mix voices.

## Fix direction

- Use `loadEnv(mode, process.cwd(), '')` in `vite.config.ts`.
- Validate key presence per provider and return a structured error.
- Disable WebSpeech fallback in chapter-generation mode.
- Surface a visible "AI voice unavailable" state.

## Acceptance criteria

- [ ] Keys from `.env` reach the dev proxy.
- [ ] Missing key returns a clear error, not audio.
- [ ] Generation mode never substitutes device voice.
