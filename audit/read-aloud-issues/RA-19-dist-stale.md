---
id: RA-19
title: dist/ is stale relative to src/
severity: low
type: build
area: build
status: open
---

# RA-19 — dist/ is stale relative to src/

## Problem

The built `dist/` bundle is older than several source files, including `App.tsx`, `OpenBookView.tsx`, and `BookPageSheet.tsx`. Anyone serving `dist/` sees older behavior than the source.

## Evidence

- `dist/index.html` timestamp: 2026-11-21 22:24.
- `src/App.tsx` timestamp: 2026-11-22 15:20.
- `src/components/OpenBookView.tsx` and `src/components/BookPageSheet.tsx` are also newer than `dist/index.html`.

## Impact

Confusing QA and user reports. Fixes verified in dev may not exist in the served build.

## Fix direction

- Rebuild `dist/` after read-aloud changes.
- Document that `dist/` is generated, not hand-edited.
- Add a pre-release check that the build is newer than `src/`.

## Acceptance criteria

- [ ] `dist/` is rebuilt from the current source before sharing.
- [ ] Release notes state which build was tested.
