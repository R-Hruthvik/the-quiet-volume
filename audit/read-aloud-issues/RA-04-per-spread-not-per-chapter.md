---
id: RA-04
title: Read-aloud is a per-spread sentence queue, not per-chapter
severity: high
type: enhancement
area: tts-core
status: open
---

# RA-04 — Read-aloud is a per-spread sentence queue, not per-chapter

## Problem

The driver builds a queue from the current spread only and requests one sentence at a time. It never assembles or generates a chapter. Page turns are driven by each sentence's `onended`, not by an audio timeline.

## Evidence

- `src/App.tsx:512-527` — queue built from `paginatedPages[pageIndex]` and `pageIndex + 1`.
- `src/App.tsx:544-574` — local cursor, one `speakSentence` per sentence.
- `src/App.tsx:547-560` — page advance after queue exhaustion.
- `src/App.tsx:529-541` — empty-spread page advance.

## Impact

A chapter is not a unit of work or playback. Generation is network-bound and sequential. Resume, seek, and word sync have no stable timeline to attach to. Deepgram's 2000-character request cap also prevents sending a whole chapter in one request.

## Fix direction

- Assemble chapter text from `volume.blocks` filtered by `sectionIndex`.
- Chunk to provider limits at sentence boundaries.
- Generate a chapter audio blob plus sentence/word/block cues.
- Drive page turns from the cue timeline.

## Acceptance criteria

- [ ] One chapter produces one saved audio record.
- [ ] Generation progress is shown per chapter.
- [ ] Playback uses a single timeline, not a per-spread callback chain.
