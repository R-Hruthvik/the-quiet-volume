---
id: RA-03
title: Playback controls appear only after playback starts
severity: high
type: bug
area: ux
status: open
---

# RA-03 — Playback controls appear only after playback starts

## Problem

Pause, resume, and stop are inside a ribbon popover that renders only when `isReadingAloud` is already true. Before starting, the ribbon click shows a page number instead. There is no visible player affordance.

## Evidence

- `src/components/OpenBookView.tsx:913-917` — idle ribbon click toggles the page-number note.
- `src/components/OpenBookView.tsx:937-964` — controls gated on `isReadingAloud && showRibbonControls`.
- `src/components/OpenBookView.tsx:919-923` — aria-label only mentions read-aloud after playback started.

## Impact

Circular discoverability: controls require playback, and playback requires finding the hidden settings button.

## Fix direction

- Show a player bar or persistent read-aloud button before playback.
- Keep pause/resume/stop reachable by keyboard and touch.
- Do not hide the player when paused or when audio is ready but not playing.

## Acceptance criteria

- [ ] A visible player/start control exists before any audio plays.
- [ ] Pause/resume/stop remain visible while paused.
- [ ] Player controls have labels, focus states, and keyboard access.
