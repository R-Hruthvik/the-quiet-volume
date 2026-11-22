---
id: RA-18
title: No tests for TTS generation, persistence, sync, or cleanup
severity: low
type: test-gap
area: testing
status: open
---

# RA-18 — No tests for TTS generation, persistence, sync, or cleanup

## Problem

Only `src/lib/bookEngine.test.ts` exists. There is no coverage for sentence splitting, generation chunking, audio persistence, resume, cue lookup, skip behavior, or delete cascade.

## Evidence

- `src/lib/bookEngine.test.ts` — the only test file.
- `package.json:6-12` — no test script; tests run manually.
- `audit/issues.md:150-154` — existing Q1 test coverage gap.

## Impact

The planned read-aloud work touches storage, async generation, playback state, and rendering. Regressions will be hard to catch.

## Fix direction

- Unit: offset tokenizer, chunk planner, cue lookup, text hash, key building, progress clamp.
- Integration with mocked TTS: generate, save, reload, resume, delete cascade, quota error.
- Component: player controls, keyboard, focus, labels.
- Add a test script and keep `tsc --noEmit` green.

## Acceptance criteria

- [ ] Unit tests cover tokenizer offsets and chunk limits.
- [ ] Integration tests cover save, reload, resume, and delete cascade.
- [ ] `npx tsc --noEmit` and the test suite run in CI or a documented command.
