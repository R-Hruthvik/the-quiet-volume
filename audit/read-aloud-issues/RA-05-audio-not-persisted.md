---
id: RA-05
title: Generated audio is not saved; memory-only object URLs
severity: high
type: enhancement
area: persistence
status: open
---

# RA-05 — Generated audio is not saved; memory-only object URLs

## Problem

Generated sentence audio is cached in an in-memory `Map` of object URLs. Nothing is written to IndexedDB or disk. A reload loses all audio and forces the provider to regenerate and recharge every sentence.

## Evidence

- `src/lib/tts.ts:106-109` — `audioCache` is a module-level `Map<string, string>`.
- `src/lib/tts.ts:197-221` — cache key and `URL.createObjectURL(blob)`.
- `src/lib/storage.ts:3-5,34-51` — IndexedDB v1 has only the `volumes` store.
- `audit/issues.md:28-32` — existing B1: object URLs are never revoked.

## Impact

No permanent audio, no offline replay, repeated cost, growing memory during long sessions.

## Fix direction

- IndexedDB v2 store `chapterAudio` keyed by volume, chapter, text hash, provider, and voice.
- Store one concatenated chapter blob plus cue metadata.
- Recreate and revoke object URLs on load/unload.
- Never put audio blobs or cue arrays on `BookVolume`; `saveVolume` mirrors full JSON to localStorage.

## Acceptance criteria

- [ ] Reloading the app and reopening a generated chapter plays from IndexedDB with no provider call.
- [ ] Object URLs are revoked when no longer used.
- [ ] Saved audio survives a browser restart subject to storage quota.
