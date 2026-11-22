---
id: RA-08
title: No word-level highlight; sentence underline only
severity: high
type: enhancement
area: sync
status: open
---

# RA-08 — No word-level highlight; sentence underline only

## Problem

The active block is re-split into sentence spans and the current sentence gets a dotted underline. There are no word spans, no character offsets, and no timing data. The requested word-by-word highlight does not exist.

## Evidence

- `src/components/BookPageSheet.tsx:236` — `isSpeakingBlock` check.
- `src/components/BookPageSheet.tsx:312` — re-split only the active block.
- `src/components/BookPageSheet.tsx:387-405` — sentence spans with dotted underline.
- `src/lib/tts.ts:3-7` — `SentenceCue` has text only, no times or offsets.

## Impact

Users cannot follow the spoken word. Sentence-only highlight also cannot survive a single chapter-long timeline.

## Fix direction

- Store word cues with `startMs`, `endMs`, and character offsets.
- Render the active block as word spans and highlight the active word.
- Update state only when the active word changes.
- Deepgram: interpolate word times within a sentence. ElevenLabs: use character alignment.

## Acceptance criteria

- [ ] The spoken word is visibly highlighted within one word.
- [ ] Highlight follows seek, skip, pause, and resume.
- [ ] Highlight does not cause per-frame React re-renders.
