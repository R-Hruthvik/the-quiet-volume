# Read Aloud — Audit and Build Plan

Audit date: 2026-11-22
Scope: `src/`, `vite.config.ts`, existing `audit/` notes.
Method: source read, two parallel read-only subagent audits, provider documentation via TinyFish (Deepgram, ElevenLabs).

---

## 1. Verdict

The read-aloud feature exists, but it is effectively hidden and much weaker than the requested mechanism.

| Requirement | Current state |
|---|---|
| Per-chapter "Read aloud" option | **Missing.** One global button, on the last page of the settings book. |
| Whole chapter sent for audio | **Missing.** Audio is generated one sentence at a time, per spread. |
| Audio permanently saved | **Missing.** Only an in-memory `Map` of object URLs; lost on reload. |
| Resume anytime | **Missing.** Playback always restarts at the first sentence of the current spread. |
| Pause / play | **Partial.** Works on the current `<audio>` element only; queue-level pause has gaps. |
| Word-level highlight | **Missing.** Sentence-level dotted underline only. |
| Sentence skip | **Missing.** |
| Paragraph skip | **Missing.** |
| Discoverable in reading view | **Missing.** No HUD or page control. |

Two additional runtime findings make the current feature look broken even when found:

1. The Vite dev proxy reads `process.env.DEEPGRAM_API_KEY` / `process.env.ELEVENLABS_API_KEY`, but Vite does not load `.env` into `process.env`. No `loadEnv` call exists. With empty keys the upstream returns 401 and the client silently falls back to the device voice.
2. `/api/tts/speak` exists only as Vite dev middleware. A static `dist` build has no endpoint, so AI voices always fall back to WebSpeech in production.

---

## 2. How to activate it today

1. Open or bind a volume so `activeVolume` is non-null.
2. Press `S`, or open the Settings book from the desk / final endpaper.
3. Turn to the **last page (page index 9)**, titled "Voice, Comfort & Volume Care". The settings TOC on page 1 also lists it.
4. Click **"▶ Read volume aloud"**.

Playback controls then appear only after starting: click the narrow silk ribbon at the top of the spine gutter to reveal **Pause voice / Resume voice / Stop**.

If no volume is open, the button does not render at all. The reading view itself has no read-aloud control.

Evidence:
- `src/components/SettingsBookView.tsx:1479` — `case 9` (last page).
- `src/components/SettingsBookView.tsx:1490-1498` — button gated on `volume`.
- `src/components/OpenBookView.tsx:910-934` — ribbon is not an entry point; it only shows a page number when idle.
- `src/components/OpenBookView.tsx:937-964` — playback popover gated on `isReadingAloud`.
- `src/components/OpenBookView.tsx:643-704` — HUD has no read-aloud item.

---

## 3. Current implementation audit

### 3.1 Read-aloud driver

`src/App.tsx:507-590`:

- Builds a queue from the **current spread only** (`paginatedPages[pageIndex]`, plus `pageIndex + 1` in two-page mode).
- Skips `scene-break` and `code` blocks.
- Splits each block with `splitIntoSentences` (`src/lib/tts.ts:96-100`).
- Calls `speakSentence` one sentence at a time; `onEnd` advances the cursor.
- When the queue drains, it turns one page and waits 350-420 ms, then rebuilds the queue.
- Empty spreads advance directly.

Consequences:
- Audio generation is sequential and network-bound: roughly one request per sentence.
- Page turns are driven by sentence `onended`, not by a timeline.
- Manual page turn during playback does not stop or resync speech. The driver later turns the page back to its own computed index.
- The queue cursor is a local `let`, so no external skip/seek is possible.

### 3.2 Highlight

`src/components/BookPageSheet.tsx:312,387-405`:

- Only the active block is re-split into sentence spans.
- The active sentence gets a dotted underline.
- No word spans, no character offsets, no timing data.
- Sentence indexes are relative to the paginated block part, not the source block.

### 3.3 Playback controls

| Control | Where | Notes |
|---|---|---|
| Start / stop | Settings page 9 | Only entry point |
| Pause / resume | Ribbon popover | `src/App.tsx:614-623`, element-level only |
| Stop | Ribbon popover | `src/components/OpenBookView.tsx:953-962` |
| Speed | Settings slider 0.8-1.4x | `src/components/SettingsBookView.tsx:1582-1590` |
| Voice | Settings cards | `src/components/SettingsBookView.tsx:1509-1576` |
| Skip sentence / paragraph / seek | none | — |
| Keyboard control | none | `src/components/OpenBookView.tsx:405-521` has no TTS keys |

### 3.4 Persistence

`src/lib/tts.ts:106-109`:

- `audioCache: Map<string, string>` stores object URLs.
- Object URLs are never revoked (existing issue B1).
- Cache is memory-only; a reload regenerates everything and re-pays provider cost.
- No resume position is stored.

`src/lib/storage.ts:3-5,34-51`:

- IndexedDB `quiet-volume-library`, version 1, one store `volumes`.
- Audio needs a version bump and a separate store. Audio must not be added to `BookVolume`, because every volume save is also mirrored as full JSON into localStorage (`storage.ts:100-106`).
- `removeVolume` and `clearAllVolumes` (`storage.ts:109-151`) have no audio cleanup; a new store would leak.

### 3.5 Provider and backend reality

- `vite.config.ts:35-36` reads `process.env` keys. Vite does not populate `process.env` from `.env`. No `.env` exists; `.env.example` only documents `GEMINI_API_KEY`.
- `vite.config.ts:17-110` has no key validation, no text cap, no 429 handling, and pipes non-2xx bodies as `audio/mpeg`.
- `vite.config.ts:14-112` is dev-only. Production has no TTS route.
- `src/lib/tts.ts:239,243-246` silently falls back to WebSpeech on any failure, including 401 and 404. A "successful" read-aloud may be the device voice.
- `stopSpeaking` cannot cancel an in-flight fetch (`src/lib/tts.ts:109,117-120`; `currentAudioResolve` is never assigned). Audio can start after Stop.
- Pause only pauses the current element; a pending sentence can still start afterward.
- `isSpeechSupported` (`src/lib/tts.ts:102-104`) is imported but never called.

### 3.6 Chapter model

- `BookSection` has `index`, `title`, `startBlockIndex` (`src/types/book.ts:57-63`).
- `BookBlock.sectionIndex` maps each block to a section (`src/types/book.ts:48-55`).
- `volume.blocks` is the stable source. `paginateBook` copies blocks and rewrites ids with `-pN` suffixes (`src/lib/parser.ts:677,690,826,837`); `volume.blocks` itself is not mutated.
- Chapter audio must be keyed from `volume.blocks` filtered by `sectionIndex`, never from paginated pages.

---

## 4. Target mechanism

For each chapter:

1. A visible **Read chapter aloud** action exists on the chapter itself (chapter heading, TOC row, and HUD).
2. On first activation, the whole chapter text is sent for synthesis, chunked to provider limits, with progress and cancel.
3. The finished audio is saved permanently in IndexedDB, keyed by book + chapter + text hash + provider + voice.
4. Reopening the chapter loads the saved audio and offers resume at the last position.
5. Play / pause works on one audio timeline.
6. Playback highlights the spoken **word** in the page text.
7. Prev/next **sentence** and prev/next **paragraph** controls jump on the same timeline.
8. Page turns follow the spoken cue; manual page turns resync the audio to the new page.
9. Deleting a book or clearing the library deletes its audio. A settings screen shows audio size and allows deletion.

---

## 5. Architecture

### 5.1 Data model

Keep audio metadata out of `BookVolume`. Add to `src/types/book.ts`:

```ts
export interface WordCue {
  text: string;
  startChar: number;   // offset in chapter text
  endChar: number;
  startMs: number;
  endMs: number;
}

export interface SentenceCue {
  blockId: string;      // source block id from volume.blocks
  sentenceIndex: number;
  text: string;
  startMs: number;
  endMs: number;
  words: WordCue[];
}

export interface BlockCue {
  blockId: string;
  startMs: number;
  endMs: number;
}

export interface ChapterAudioRecord {
  key: string;              // audio:v1:<volumeId>:<sectionIndex>:<textHash>:<provider>:<voice>
  volumeId: string;
  sectionIndex: number;
  textHash: string;
  provider: TTSProvider;
  voice: string;
  mime: string;             // audio/mpeg
  blob: Blob;               // concatenated chapter audio
  durationMs: number;
  bytes: number;
  createdAt: number;
  sentences: SentenceCue[];
  blocks: BlockCue[];
}

export interface ChapterAudioProgress {
  volumeId: string;
  sectionIndex: number;
  positionMs: number;
  updatedAt: number;
}
```

IndexedDB changes in `src/lib/storage.ts`:

- Bump `DB_VERSION` to 2.
- Add store `chapterAudio`, keyPath `key`, index `volumeId`.
- Add store `audioProgress`, keyPath `[volumeId, sectionIndex]`.
- Cascade delete in `removeVolume` and `clearAllVolumes`.
- Request `navigator.storage.persist()` before the first chapter generation.
- Expose `estimate()` for a settings size display.
- Recreate object URLs from stored blobs; revoke on unload/eviction.

### 5.2 Chapter text assembly

From `volume.blocks`:

- Select `block.sectionIndex === section.index`.
- Include `chapter-title`, `heading`, `paragraph`, `quote`, `source-note`.
- Exclude `scene-break` and `code` (same rule as current driver).
- Preserve paragraph breaks in the submitted text for natural pauses.
- Compute `textHash` with SHA-256 over normalized chapter text.

### 5.3 Generation pipeline

1. Build chapter text, sentence list with character offsets, and block ranges.
2. Look up `chapterAudio` by key. If present, load it.
3. Otherwise, plan chunks:
   - Deepgram Aura: max 2000 characters per request; chunk at sentence boundaries to <= 1800.
   - ElevenLabs: use `/with-timestamps`; chunk at sentence boundaries to <= 4000 characters.
4. Generate chunks with bounded concurrency (3-4) and 2 retries with backoff.
5. Measure each chunk with `AudioContext.decodeAudioData` to get exact duration.
6. Derive timings:
   - ElevenLabs: map `alignment.characters` + start/end seconds to words, sentences, and blocks exactly.
   - Deepgram: sentence boundaries are exact (one sentence per request or a known sentence list per chunk); word times inside a sentence are interpolated by character share.
7. Concatenate chunks into one MP3 `Blob`; offset all cue times by chunk start.
8. Save the record atomically. On cancel or unrecoverable failure, save nothing and keep the existing record.
9. Disable WebSpeech fallback during generation. A failed chunk must fail the chapter, not silently mix voices.

### 5.4 Provider sync strategy

| Provider | Chapter request | Sentence timing | Word timing | Saved audio |
|---|---|---|---|---|
| Deepgram Aura | Chunked, <= 1800 chars, <= 2000 limit | Exact per chunk | Interpolated within sentence by character share | Yes |
| ElevenLabs | Chunked, <= 4000 chars, `/with-timestamps` | Derived from char alignment | Exact from char alignment | Yes |
| WebSpeech | Not used for saved audio | `onboundary` | `onboundary` `charIndex` | No; live only |

Deepgram does not return timestamps for TTS, and its request cap is 2000 characters. ElevenLabs `/v1/text-to-speech/{voice_id}/with-timestamps` returns `audio_base64`, `alignment.characters`, `character_start_times_seconds`, and `character_end_times_seconds`. This is the only current path to true word timing without a separate aligner.

Optional future mode: forced alignment over saved audio (ElevenLabs Forced Alignment or Deepgram STT) for exact word timing with any provider. Out of scope for the first build.

### 5.5 Playback and sync loop

- One `<audio>` element per chapter, source = stored blob object URL.
- Cue lookup: binary search `sentences` by `currentTime`; derive the active word from `words`.
- Update React state only when the active word changes (about 3-5 times per second), not every animation frame. Use `timeupdate` plus a short `requestAnimationFrame` loop while playing.
- Render the active block as word spans; wrap the active word in a highlight span. Keep punctuation and whitespace intact.
- Page mapping: find the page whose block has `sourceBlockId === cue.blockId`. Add an optional `sourceBlockId` to `BookBlock` in the paginator copies; do not parse `-pN` suffixes.
- Auto page turn when the cue's page changes. If the user manually turns a page while playing, seek to the first cue on the new spread (recommended) and keep playing.
- Save progress every 2 seconds, on pause, and on `pagehide`.
- On reopen: load audio, seek to saved position, show a play button. Do not autoplay; browsers block it without a gesture.
- Playback rate uses `audio.playbackRate`; speed is never baked into saved audio.

### 5.6 Skip controls

- Player bar: `Prev paragraph`, `Prev sentence`, `Play/Pause`, `Next sentence`, `Next paragraph`, plus elapsed / total and a seek bar.
- Jump target is the cue start time. If paused, stay paused. If playing, continue.
- Keyboard (no conflicts with existing `[`/`]`, `p`/`n`, `Space`, arrows):
  - `,` previous sentence
  - `.` next sentence
  - `Shift+,` previous paragraph
  - `Shift+.` next paragraph
  - `Space` toggles play/pause **while read-aloud is active**; otherwise keeps current page/scroll behavior.
  - `Escape` stops read-aloud before closing the book (or leaves close behavior and stops audio first).

### 5.7 UI surfaces

1. **Chapter heading** (`BookPageSheet.tsx:253-269`): add a small speaker/play button. Persistent on touch, hover/focus on desktop. Shows progress or "generating" state.
2. **TOC rows** (`FrontMatterPages.tsx:341-362`): add a play icon that starts that chapter without navigating away first.
3. **HUD** (`OpenBookView.tsx:643-704`): add `▶ Read chapter` beside `Prev Ch` / `Next Ch`.
4. **Ribbon popover** (`OpenBookView.tsx:937-964`): expand to the full player bar.
5. **Settings page 9**: keep the global "Read volume aloud" (queues chapters) and add an "Audio library" list with size, voice, duration, delete, and "regenerate for current voice".
6. **Desk settings book label**: mention voice/read-aloud so users know the feature exists.

### 5.8 Backend

Development:

- Load env correctly in `vite.config.ts` with `loadEnv(mode, process.cwd(), '')`.
- Validate provider and key presence; return JSON errors with a clear message.
- Cap text length and enforce chunk limits.
- Pass through 429 and upstream errors as JSON, never as `audio/mpeg`.
- Add `/api/tts/chapter` (or `?timestamps=1`) that returns audio for Deepgram and `{ audioBase64, alignment }` for ElevenLabs.
- Add request timeout/abort.

Production:

- A static build cannot generate audio. Add a serverless function or small server with the same contract before claiming AI read-aloud works in production.
- Never expose provider keys to the browser.
- Add auth or rate limiting if the endpoint is public.

---

## 6. Phased build plan

### Phase 0 — Verify runtime (0.5 day)

1. Add `loadEnv` and key presence checks in `vite.config.ts`.
2. Create a local `.env` with real keys; never commit it.
3. Confirm a Deepgram and an ElevenLabs request returns audio, not a 401.
4. Decide dev vs production target. If production, schedule the backend work before Phase 2.
5. Rebuild `dist`; it is currently older than `src/App.tsx`, `OpenBookView.tsx`, and `BookPageSheet.tsx`.

Exit: a real provider voice plays from the app; no silent WebSpeech fallback.

### Phase 1 — Discoverability (0.5-1 day)

1. Add HUD "Read chapter" button.
2. Add play control on chapter headings and TOC rows.
3. Expand the ribbon popover with Play/Pause, Prev/Next sentence, Prev/Next paragraph, Stop.
4. Add keyboard bindings `,` `.` `Shift+,` `Shift+.`, and Space-while-active.
5. Update desk/settings copy to mention read-aloud.

Exit: a user can start read-aloud from the open book without opening settings.

### Phase 2 — TTS core (2-3 days)

1. Add an offset-aware tokenizer returning `{ text, startChar, endChar }` for sentences and words. Keep `splitIntoSentences` as a wrapper.
2. Add chapter text assembly and `textHash`.
3. Add the chunk planner and bounded-concurrency generator.
4. Add `/with-timestamps` handling for ElevenLabs and duration measurement for Deepgram.
5. Disable WebSpeech fallback in generation mode; surface chunk errors.
6. Add cancel and retry.

Exit: a full chapter generates into a single blob with sentence/word cues.

### Phase 3 — Persistence (1-2 days)

1. IndexedDB v2: `chapterAudio`, `audioProgress`, indexes, cascade delete.
2. `navigator.storage.persist()` and `estimate()`.
3. Load saved audio on chapter open; resume position.
4. Settings "Audio library": size, delete, regenerate on voice change.
5. Object URL lifecycle and revocation.

Exit: reload the app, reopen the chapter, and resume at the saved position with no provider call.

### Phase 4 — Player and sync (2-3 days)

1. Single-audio player state machine.
2. Cue lookup and word highlight rendering.
3. `sourceBlockId` mapping and page-follow.
4. Manual page turn resync.
5. Seek bar and skip controls.
6. Progress persistence.

Exit: word highlight matches audio within one word; skip sentence/paragraph is instant; page follows without jumping back.

### Phase 5 — Hardening (1-2 days)

1. Production endpoint or explicit feature gate.
2. 429/timeout/retry/backoff; no silent fallback.
3. Cancel in-flight requests on Stop.
4. Queue-level pause (do not start the next chunk while paused).
5. Quota-exceeded UX; per-book audio cap warning.
6. Privacy note near voice selection: AI voices send chapter text to the provider.

Exit: no mixed voices, no audio after Stop, no unbounded cache, clear errors.

### Phase 6 — Tests and accessibility (1-2 days)

1. Unit tests: tokenizer offsets, chunk planner, cue lookup, key/hash, progress clamp.
2. Integration tests with mocked TTS: generate, save, reload, resume, delete cascade, quota failure.
3. Component tests: controls, labels, keyboard, focus.
4. Manual matrix: Chrome/Safari/iOS, two-page/single, all paper themes, dark paper, 2-hour session.
5. `npx tsc --noEmit` and existing engine tests.

Exit: all checks pass; no regressions in existing audit items.

---

## 7. Test plan

### Unit

- Sentence/word offsets round-trip to the original text.
- Chunk planner never exceeds provider limits and never splits a word.
- Cue binary search handles boundaries, gaps, and end-of-audio.
- Text hash is stable across pagination and layout changes.
- Progress clamps to `[0, duration]`.

### Integration

- Generate chapter → record saved → reload → audio loads from IDB → resume position applied.
- Delete book → audio records and progress removed.
- `clearAllVolumes` → audio store empty.
- Quota error → user-visible message, no partial record.
- Provider 401/429 → error state, no WebSpeech substitution in saved mode.

### Manual

- Start from chapter heading, TOC, HUD, and settings.
- Pause during generation and during playback.
- Stop during an in-flight chunk; confirm no audio starts later.
- Skip sentence and paragraph while playing and while paused.
- Turn pages manually during playback; confirm resync.
- Change voice; confirm regeneration prompt and old audio handling.
- Offline replay of a saved chapter.
- Screen reader: controls announced, highlight not announced per word.
- Storage: generate several chapters, check `estimate()` and deletion.

---

## 8. Risks and decisions

| Risk | Impact | Mitigation |
|---|---|---|
| No production TTS backend | Feature works only in dev | Add serverless/server endpoint before release, or gate AI voices and say so |
| Provider keys not loaded in dev | Silent device-voice fallback today | `loadEnv`, key checks, visible error state |
| MP3 chunk concatenation | Playback/seek quirks in some browsers | Test Chrome/Safari; keep segment list as fallback; strip duplicate ID3 headers |
| Deepgram word timing is interpolated | Highlight may drift within a long sentence | Sentence-sized chunks; offer ElevenLabs precise mode |
| Storage growth | 10-hour book at 32 kbps is about 144 MB | Per-chapter records, size UI, delete, quota handling, `persist()` |
| Layout changes move pages | Cue-to-page mapping breaks | Map via `sourceBlockId`, not page index or paginated id |
| Voice change invalidates audio | Old audio plays in the wrong voice | Include voice in key; prompt to regenerate; delete old after success |
| Re-import creates a new `volume.id` | Audio orphaned | Keep `textHash`; offer "adopt existing audio" for matching text |
| iOS autoplay policy | Audio blocked after async generation | Require a play tap after generation; do not autoplay |
| Long generation time | User thinks it hung | Progress `n/m`, cancel, per-chapter status |
| Cost surprise | ElevenLabs free tier is 10k chars/month | Show estimated characters/cost before generation; default to Deepgram |
| WebSpeech mixed into saved audio | Corrupt chapter | Hard-disable fallback in generation mode |

### Pricing and limits checked

- Deepgram Aura: 2000 characters per request; MP3 bit rates 32000 or 48000; Aura-1 about $0.015 per 1k characters, Aura-2 about $0.030 per 1k. A 450k-character book is roughly $6.75 on Aura-1.
- ElevenLabs: Free tier 10,000 credits/month; `/with-timestamps` returns character alignment; request caps vary by model (chunk to 4000 regardless). Free tier is enough for about 3 average chapters per month, so it cannot be the default for whole books.
- Verify live pricing before showing cost copy; provider pricing changes.

### Open decisions

1. Default provider for saved chapters: Deepgram (cheap, approximate word timing) or ElevenLabs (precise, expensive). Recommendation: Deepgram default, ElevenLabs selectable as "precise sync".
2. Manual page turn during playback: seek audio to the new page (recommended) or pause and show resume.
3. Auto-generate the next chapter while the current one plays (prefetch) or generate only on demand. Recommendation: on demand first; prefetch after the feature is stable.
4. Audio bit rate: 32 kbps mono (about 14.4 MB/hour) is the right default for speech. Do not store 128 kbps.

---

## 9. Evidence index

| Claim | Evidence |
|---|---|
| Only entry point | `src/components/SettingsBookView.tsx:1479-1498` |
| Button hidden without volume | `src/components/SettingsBookView.tsx:1490` |
| No HUD control | `src/components/OpenBookView.tsx:643-704` |
| Ribbon is not an entry point | `src/components/OpenBookView.tsx:910-934` |
| Controls gated on playing | `src/components/OpenBookView.tsx:937-964` |
| Per-spread sentence queue | `src/App.tsx:507-579` |
| Sentence-only highlight | `src/components/BookPageSheet.tsx:312,387-405` |
| In-memory audio cache | `src/lib/tts.ts:106-109,197-221` |
| Silent WebSpeech fallback | `src/lib/tts.ts:239,243-246` |
| Stop cannot cancel fetch | `src/lib/tts.ts:109,117-120` |
| Dev-only endpoint | `vite.config.ts:14-112` |
| Env not loaded | `vite.config.ts:35-36`; no `loadEnv` in repo |
| IndexedDB v1, one store | `src/lib/storage.ts:3-5,34-51` |
| No audio cleanup | `src/lib/storage.ts:109-151` |
| Paginated ids mutate | `src/lib/parser.ts:677,690,826,837` |
| Sections and block mapping | `src/types/book.ts:48-63`; `src/lib/parser.ts:322-500` |
| Keyboard conflicts | `src/components/OpenBookView.tsx:447-498` |

### Provider sources

- Deepgram TTS limits and response: https://developers.deepgram.com/docs/text-to-speech
- Deepgram MP3 bit rate: https://developers.deepgram.com/docs/tts-bit-rate
- ElevenLabs with-timestamps: https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps
- ElevenLabs forced alignment: https://elevenlabs.io/docs/overview/capabilities/forced-alignment
- ElevenLabs pricing: https://elevenlabs.io/pricing
