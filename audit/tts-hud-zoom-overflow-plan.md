# TTS / HUD / Zoom / Page Overflow — Build Plan

Plan date: 2026-05-17  
Input: user-provided changelog/report ("Why Text Was Cut Off", fixes, TTS models/allowances, integration details).  
Purpose: reconcile reported work against current codebase, then plan remaining build/fix/verification work.

## Current state (reconciled)

| Reported item | Current code status | Gap |
|---|---|---|
| HUD moved to bottom-right, collapsible | Present. `OpenBookView.tsx` has `fixed bottom-3.5 right-4`, `hudCollapsed` state, `📖 Nav` / `✕`. | Verify no overlap on small viewports/endpaper; add a11y/focus checks. |
| Bottom page overflow eliminated by recalibrating `SIZE_CAPACITY` natural to 780 | **Not matching report**. `parser.ts` has `natural: 810` (small 1040, compact 910, comfortable 680, large 560). | Re-tune capacities/weights against real rendered metrics; add regression tests for overflow. |
| `estimateBlockWeight` adjusted for single-line dialogue margins | Current weights are simple kind-based estimates; no explicit dialogue-margin adjustment visible. | Confirm if needed; if overflow remains, improve weight model or add render-measurement safety. |
| Max camera zoom increased to 2.40 | Present in UI controls/keyboard clamps in `OpenBookView.tsx` and `SettingsBookView.tsx` (`max 2.4`, clamp 0.65-2.4). `dimensions.ts` clamps effective scale max 2.8. | Confirm all zoom entry points (settings, live bar, keyboard, any defaults/docs) consistent; ensure camera pan eliminates dead desk space at high zoom. |
| Browser zoom (`Ctrl +/-`) synced via DPR media query | Present in `OpenBookView.tsx` resize/DPR watcher. | Verify no feedback loop/jank; check SettingsBookView behavior if needed. |
| `/api/tts/speak` proxy routes Deepgram/ElevenLabs, streams MP3 | Present in `vite.config.ts` dev middleware. | Missing key/status/input guards (already B4). No production backend. |
| Settings handbook Page 9 has voice cards + sample preview | Present in `SettingsBookView.tsx`; catalog in `tts.ts`. | Verify samples exist, preview error handling, disclosure/cost copy accuracy. |
| Audio caching avoids duplicate API calls | Present as in-memory `Map<string,string>` in `tts.ts`. | **Leak**: object URLs never revoked (B1). No size bound. |
| Groq Orpheus skipped (manual terms) | Not implemented. | Decide: omit, document, or add optional provider behind explicit config. |

## Build plan

### Phase A — Verify/reproduce reported UI bugs

1. **Capture baseline screenshots** at desktop/mobile widths, zoom 100/150/200/240%, single/two-page, notebook/novel formats.
2. **Reproduce overflow**: bind/import long text with short dialogue lines and long paragraphs; check bottom clipping.
3. **Reproduce HUD overlap**: check first lines, TOC/header, small viewport, collapsed/expanded HUD.
4. **Reproduce empty left desk space**: high zoom in single-page and two-page modes, left/right active sides.
5. **Record findings** in `audit/issues.md` or a short addendum.

Exit: concrete repro cases before changing parser/camera.

### Phase B — Page overflow fix (parser/layout)

1. **Tune capacity model** in `src/lib/parser.ts`:
   - Evaluate `SIZE_CAPACITY` values against actual rendered page body height/margins/line-height. The report claims natural 780; current is 810 - validate empirically before changing.
   - Consider format/book-size-specific safety margin, not just global natural capacity.
2. **Improve block weight estimation**:
   - Account for paragraph spacing, dialogue/short-line blocks, heading/source-note margins, quote padding, code blocks.
   - Add small safety buffer (e.g., 3-5%) or max-lines guard for content area.
3. **Add defensive render guard** in `BookPageSheet.tsx` only if needed:
   - Prefer pagination correctness over clipping. Avoid hiding overflow silently; if guard used, log/dev-warn in development.
4. **Tests** (`src/lib/bookEngine.test.ts`):
   - Add regression cases for long prose + dialogue sequences.
   - Assert last block on page fits within capacity budget and no pathological overfill for known fixture.
   - Add fixtures for notebook/novel, natural/comfortable, A5/B5.

Exit: no bottom-half text clipping in repro fixtures; tests pass.

### Phase C — HUD/nav polish

1. **Confirm bottom placement** has no conflict with bottom controls/toasts/rest whisper/zoom notice.
2. **A11y**: ensure collapse/expand button has clear `aria-label`, keyboard focus visible, state announced if useful.
3. **Responsive behavior**: on narrow screens, keep HUD compact; avoid covering page numbers/content.
4. **Optional**: persist HUD collapsed state in settings/localStorage only if user expects it; default expanded/collapsed decision documented.

Exit: HUD never obscures reading text; keyboard/screen reader usable.

### Phase D — Zoom/camera behavior

1. **Normalize zoom bounds** across all surfaces:
   - Single source constant, e.g. `MIN_ZOOM=0.65`, `MAX_ZOOM=2.4`.
   - Apply in `OpenBookView`, `SettingsBookView`, `dimensions` if needed, docs/help text.
2. **Dead-space elimination** at high zoom:
   - Verify `computeBookCameraTransform` pans active page into view for single and two-page modes.
   - For zoom > 1 in two-page, ensure active side gets priority and opposite page remains physically present but not creating large empty desk void.
   - Add/adjust tests in `bookEngine.test.ts` for zoom 2.4 single/two-page left/right.
3. **Browser zoom/DPR sync**:
   - Keep DPR watcher; debounce/guard against rapid change loops.
   - Verify no scrollY jump or camera jitter.
4. **User feedback**: existing zoom toast is good; ensure it announces via `role="status"` (already present).

Exit: zoom 65%-240% stable; no empty desk gap at high zoom; keyboard/browser zoom behave predictably.

### Phase E — TTS build hardening

1. **Fix cache leak (B1)**:
   - Bound cache size/count; `URL.revokeObjectURL` on eviction/clear.
   - Clear cache on explicit stop/reset if appropriate.
2. **Harden proxy (B4/BE2)**:
   - Validate provider, key presence, text length.
   - On upstream error/non-2xx, return JSON error; don't pipe error as audio/mpeg.
   - Add timeout/abort where sensible.
3. **Client error handling** (`tts.ts`):
   - Detect non-audio/error JSON responses before blob playback.
   - Fallback to WebSpeech only when appropriate; surface quiet notice.
4. **Voice catalog accuracy**:
   - Verify preview sample files exist under `public/samples/`.
   - Confirm allowance/cost copy is clearly labeled as estimate/provider-dependent.
   - Add privacy disclosure near AI voice selection: selected AI voice sends sentence text to provider.
5. **Production backend decision (BE1)**:
   - If deploying static-only: gate AI providers behind backend availability check or document limitation.
   - If deploying with server/serverless: implement same `/api/tts/speak` contract with auth/rate limit/input cap/logging redaction.
6. **Groq Orpheus**:
   - Keep omitted unless explicitly requested. If added later, gate behind env/config and setup check; do not claim free allowance without verification.

Exit: no TTS memory leak; clear errors; no broken previews; deployment path explicit.

### Phase F — Docs/env cleanup

1. Update `README.md` with real app name, setup, env vars (`DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY`), dev command, TTS backend note.
2. Update `.env.example` accordingly.
3. Remove/justify unused deps (`@google/genai`, `express`, `dotenv`) after confirming no runtime use.
4. Add short "Privacy & TTS" note: local-first storage; AI read-aloud sends text to selected provider.

Exit: docs match code and deployment reality.

## Verification checklist

- [ ] `npx tsc --noEmit`
- [ ] `node --import tsx --test src/lib/bookEngine.test.ts`
- [ ] Manual: no bottom text clipping on natural/comfortable/large, notebook/novel, A5/B5.
- [ ] Manual: HUD never overlaps first text line; collapse/expand works by mouse/keyboard/touch.
- [ ] Manual: zoom 65%-240% via keyboard/live bar/settings; no empty desk gap; browser zoom stable.
- [ ] Manual: TTS Deepgram/ElevenLabs/WebSpeech selection, preview, read-aloud, pause/resume/stop, error fallback.
- [ ] Manual: no growing memory during repeated read-aloud (spot check Performance/Memory).
- [ ] Docs/env reflect actual keys and backend requirement.

## Suggested order

1. Phase A repro/baseline
2. Phase B overflow fix + tests
3. Phase D zoom constants/pan tests
4. Phase C HUD polish
5. Phase E TTS leak + proxy hardening
6. Phase F docs/env cleanup
7. Final verification
