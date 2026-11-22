---
id: RA-17
title: No disclosure that chapter text is sent to the TTS provider
severity: low
type: bug
area: privacy
status: open
---

# RA-17 — No disclosure that chapter text is sent to the TTS provider

## Problem

The app is local-first, but AI read-aloud sends chapter text to Deepgram or ElevenLabs. The voice settings do not disclose this. WebSpeech is device-local, but that difference is not explained.

## Evidence

- `src/components/SettingsBookView.tsx:1484-1596` — voice selection UI has no privacy note.
- `src/lib/tts.ts:9-94` — catalog describes cost and style only.
- `audit/issues.md:116-120` — existing BE3 privacy disclosure gap.

## Impact

Users may believe all reading data stays on device. Whole-chapter generation increases the amount of text sent.

## Fix direction

- Add a short note near voice selection: AI voices send chapter text to the selected provider; device voice stays local.
- Link to provider retention terms.
- State that saved audio is stored locally.

## Acceptance criteria

- [ ] Voice settings disclose third-party text transfer.
- [ ] Device voice is labeled as local.
- [ ] Copy is visible before the first AI generation.
