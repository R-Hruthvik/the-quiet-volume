---
id: RA-12
title: Audio not deleted with book; no quota or persist management
severity: medium
type: bug
area: persistence
status: open
---

# RA-12 — Audio not deleted with book; no quota or persist management

## Problem

There is no audio store yet, but the existing delete paths only touch volume JSON. Any future audio store would leak records permanently. There is also no storage estimate, no persistence request, and no size management.

## Evidence

- `src/lib/storage.ts:109-129` — `removeVolume` deletes only the volume.
- `src/lib/storage.ts:131-151` — `clearAllVolumes` clears only volumes and keys.
- `src/lib/storage.ts:100-106` — full volume JSON is mirrored to localStorage; audio must not go there.
- No `navigator.storage.estimate()` or `persist()` in `src/`.

## Impact

Unbounded storage growth. A 10-hour book at 32 kbps is about 144 MB. Safari can evict non-persistent IndexedDB data.

## Fix direction

- Add an audio store indexed by `volumeId`.
- Cascade delete in `removeVolume` and `clearAllVolumes`.
- Request `navigator.storage.persist()` before first generation.
- Show per-book audio size and allow deletion in settings.
- Handle `QuotaExceededError` with an actionable message.

## Acceptance criteria

- [ ] Deleting a book deletes all its audio and progress records.
- [ ] Clearing the library leaves the audio store empty.
- [ ] Settings shows audio size and a delete action per chapter or book.
- [ ] Quota failure is visible and leaves no partial record.
