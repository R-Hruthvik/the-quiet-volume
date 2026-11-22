---
id: RA-16
title: Voice change does not invalidate or regenerate saved audio
severity: low
type: enhancement
area: persistence
status: open
---

# RA-16 — Voice change does not invalidate or regenerate saved audio

## Problem

Voice selection is global and persisted, but saved chapter audio will be tied to the voice used at generation time. There is no UI or key strategy to detect a voice change, regenerate, or explain why a chapter plays in the old voice.

## Evidence

- `src/lib/storage.ts:29-31` — global `ttsProvider`, `ttsVoice`, `ttsSpeed`.
- `src/components/SettingsBookView.tsx:1518-1523` — selecting a voice updates settings only.
- `src/lib/tts.ts:197` — cache key includes provider and voice, but cache is memory-only.

## Impact

After the planned persistence work, a user can change voice and still hear old audio with no explanation.

## Fix direction

- Include provider and voice in the audio key.
- Show the voice used for each saved chapter.
- Offer "Regenerate for current voice" and delete the old record only after success.
- Do not bake speed into saved audio; speed stays a playback rate.

## Acceptance criteria

- [ ] Changing voice marks existing chapter audio as stale.
- [ ] Regeneration replaces the old record atomically.
- [ ] Speed changes do not invalidate saved audio.
