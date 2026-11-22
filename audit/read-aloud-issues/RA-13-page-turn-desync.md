---
id: RA-13
title: Manual page turn desyncs playback; paginated ids not mapped to source blocks
severity: medium
type: bug
area: playback
status: open
---

# RA-13 — Manual page turn desyncs playback; paginated ids not mapped to source blocks

## Problem

Turning a page during read-aloud changes the visible spread but does not stop or resync speech. The driver later turns the page back to its own computed index. Paginated block ids are rewritten with `-pN` suffixes, so they cannot be used to map a cue back to a page.

## Evidence

- `src/App.tsx:362-378` — `handleChangePageIndex` does not touch speech state.
- `src/App.tsx:547-560` — driver turns to its own computed next index.
- `src/lib/parser.ts:677,690` — `normalizeBlocksForCapacity` rewrites ids.
- `src/lib/parser.ts:826,837` — pagination rewrites ids with `-p1` / `-p2`.

## Impact

Audio and page can diverge. Resume and word highlight can point at text that is no longer visible.

## Fix direction

- Add `sourceBlockId` to paginated block copies.
- Map the active cue to a page through `sourceBlockId`.
- On manual page turn, seek audio to the first cue on the new spread.
- Keep a follow mode if auto page turn should be optional.

## Acceptance criteria

- [ ] Manual page turn resyncs audio to the visible page.
- [ ] Auto page turn never jumps back to an old spread.
- [ ] Cue-to-page mapping survives layout, font, and page-mode changes.
