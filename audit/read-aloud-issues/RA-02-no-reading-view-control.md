---
id: RA-02
title: No read-aloud control in reading view, chapter heading, or TOC
severity: high
type: enhancement
area: ui
status: open
---

# RA-02 — No read-aloud control in reading view, chapter heading, or TOC

## Problem

The reading view exposes no per-chapter or per-page read-aloud action. Chapter headings and TOC rows are inert for audio. The requested mechanism requires a "Read aloud" option on each chapter.

## Evidence

- `src/components/OpenBookView.tsx:643-704` — HUD has First Page, Contents, Prev Ch, Next Ch, Close; no audio action.
- `src/components/BookPageSheet.tsx:253-269` — chapter-title `<h2>` has no controls.
- `src/components/FrontMatterPages.tsx:341-362` — TOC rows only navigate.
- `src/components/OpenBookView.tsx:910-934` — ribbon is not an entry point while idle.

## Impact

The feature is unreachable from the place where the user reads. Per-chapter generation cannot be triggered.

## Fix direction

- Chapter heading: small speaker/play button; persistent on touch, hover/focus on desktop.
- TOC row: play icon that starts that chapter.
- HUD: "Read chapter" next to chapter navigation.
- Ribbon: keep as the compact player handle once audio exists.

## Acceptance criteria

- [ ] Chapter heading has an accessible "Read this chapter aloud" control.
- [ ] TOC row can start that chapter without first navigating.
- [ ] HUD exposes read-aloud for the current chapter.
- [ ] Controls show generating, ready, playing, and paused states.
