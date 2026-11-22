---
id: RA-07
title: No sentence or paragraph skip
severity: high
type: enhancement
area: playback
status: open
---

# RA-07 — No sentence or paragraph skip

## Problem

Read-aloud exposes only pause, resume, and stop. There is no next/previous sentence, next/previous paragraph, or chapter jump while audio is active.

## Evidence

- `src/components/OpenBookView.tsx:946-962` — only pause/resume and stop.
- `src/App.tsx:544` — queue cursor is a local `let`, not exposed to UI.
- `src/components/OpenBookView.tsx:447-498` — keyboard map has no TTS bindings.

## Impact

Users cannot skip a badly pronounced sentence or jump past a paragraph. They must stop and restart.

## Fix direction

- Add Prev/Next sentence and Prev/Next paragraph controls to the player.
- Jump to cue start; preserve paused/playing state.
- Keyboard: `,` / `.` for sentence, `Shift+,` / `Shift+.` for paragraph.
- Make `Space` toggle play/pause while read-aloud is active.

## Acceptance criteria

- [ ] Sentence skip moves to the exact next/previous sentence cue.
- [ ] Paragraph skip moves to the first sentence of the next/previous block.
- [ ] Keyboard shortcuts do not conflict with page, chapter, zoom, or search shortcuts.
