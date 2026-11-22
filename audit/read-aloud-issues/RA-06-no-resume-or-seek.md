---
id: RA-06
title: No resume position and no seek
severity: high
type: enhancement
area: playback
status: open
---

# RA-06 — No resume position and no seek

## Problem

Starting read-aloud always begins at the first sentence of the current spread. There is no saved playback position, no seek bar, and no way to continue where the user stopped.

## Evidence

- `src/App.tsx:598-604` — start index derives from `lastPageIndex` only.
- `src/App.tsx:507-527` — queue starts at sentence 0.
- `src/types/book.ts:99-100` — volume stores `lastPageIndex` and `lastBlockId`, not audio time.
- `src/components/BookPageSheet.tsx:323-331` — `lastBlockId` is used for a pencil glyph, not playback.

## Impact

The core requested behavior, "visit anytime and continue the audio", is impossible.

## Fix direction

- Add `audioProgress` keyed by volume and chapter with `positionMs`.
- Save every 2 seconds, on pause, and on `pagehide`.
- On open, seek to the saved position and wait for a play gesture.
- Add a seek bar for manual position changes.

## Acceptance criteria

- [ ] Closing and reopening resumes at the last position within 2 seconds.
- [ ] Seeking updates both audio time and the highlighted word.
- [ ] Progress is per chapter, not per book.
