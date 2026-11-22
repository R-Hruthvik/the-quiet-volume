---
id: RA-01
title: Read-aloud entry point buried on settings page 9
severity: high
type: bug
area: discoverability
status: open
---

# RA-01 — Read-aloud entry point buried on settings page 9

## Problem

The only way to start read-aloud is a button on the last page of a separate 10-page settings book. It is not visible from the reading view, the desk, or the table of contents. The button also disappears when no volume is open.

## Evidence

- `src/components/SettingsBookView.tsx:1479` — `case 9`, the last page.
- `src/components/SettingsBookView.tsx:1490-1498` — button gated on `volume`.
- `src/components/SettingsBookView.tsx:54` — the only copy mentioning read-aloud lives on settings page 1.
- `src/App.tsx:592-612` — the toggle is wired only to that button.

## Impact

Users cannot find the feature. A user with no book open sees no button at all. On mobile the settings book opens at page 0 in single-page mode, so reaching page 9 takes nine page turns.

## Fix direction

- Add a primary "Read chapter" action in the reading view.
- Keep the settings toggle as a secondary global action.
- Deep-link the settings TOC row to the voice page.
- Mention voice/read-aloud on the desk settings-book label.

## Acceptance criteria

- [ ] From an open book, read-aloud starts in one visible action without opening settings.
- [ ] The settings TOC row "Voice, Comfort & Volume Care" opens the voice page directly.
- [ ] With no volume open, the settings page explains why read-aloud is unavailable instead of hiding the control silently.
