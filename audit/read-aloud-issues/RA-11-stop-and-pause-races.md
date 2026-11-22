---
id: RA-11
title: Stop cannot cancel in-flight request; pause is not queue-level
severity: medium
type: bug
area: playback
status: open
---

# RA-11 — Stop cannot cancel in-flight request; pause is not queue-level

## Problem

`stopSpeaking` pauses and clears the current audio element but cannot abort a pending fetch. The unused `currentAudioResolve` field suggests cancellation was intended but never implemented. Pause only affects the current element, so a pending sentence can start afterward.

## Evidence

- `src/lib/tts.ts:109` — `currentAudioResolve` declared.
- `src/lib/tts.ts:117-120` — invoked but never assigned.
- `src/lib/tts.ts:200-242` — fetch and playback continue after stop.
- `src/lib/tts.ts:130-140` — `pauseSpeaking` only pauses the element.
- `src/App.tsx:546` — session check happens only after `onended`.

## Impact

Audio can start after the user presses Stop. Pause during a network request is not honored. For chapter generation, an aborted run can still charge the provider and write partial audio.

## Fix direction

- Use `AbortController` per request and abort on stop/cancel.
- Track a queue-level `paused` flag and do not start the next chunk while paused.
- Ignore late responses from an old session.
- For generation, discard partial results on cancel.

## Acceptance criteria

- [ ] Stop during a pending request produces no audio.
- [ ] Pause during a pending request prevents the next sentence from starting.
- [ ] Cancelled generation leaves no partial record.
