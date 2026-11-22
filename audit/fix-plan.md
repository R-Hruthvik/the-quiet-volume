# The Quiet Volume — Fix Plan

Plan date: 2026-05-17  
Source: `audit/issues.md`  
Goal: fix all identified issues with smallest safe changes, regression tests where practical, and no behavior regressions to the book-reading metaphor.

## Guiding constraints

- Keep local-first/privacy posture intact.
- Preserve existing visual language and reading flow.
- Prefer extraction/refactor only where it reduces bug risk or duplication.
- Add/adjust tests for every logic bug fix.
- Do not expose TTS provider keys to client; production TTS needs backend contract.

## Phase 0 — Baseline and safety net (first)

1. **Create working branch / checkpoint** (if git used later) and record baseline:
   - `npx tsc --noEmit`
   - `node --import tsx --test src/lib/bookEngine.test.ts`
2. **Add issue IDs to commits/PR notes** (`B1`–`B8`, `F1`–`F4`, `BE1`–`BE3`, `A1`–`A4`, `Q1`–`Q2`).
3. **Define acceptance checks** per phase before editing.

Exit criteria: baseline green; audit files committed/available.

## Phase 1 — High-severity correctness fixes

### P1.1 Fix TTS blob cache leak (B1)
- **Files**: `src/lib/tts.ts`
- **Changes**:
  - Add bounded cache (e.g., max N entries or max chars/bytes estimate).
  - On cache eviction/delete/clear, call `URL.revokeObjectURL`.
  - Add `clearSpeechCache()` for stop/unmount/reset paths if needed.
  - Ensure failed fetch/playback does not retain unusable URLs.
- **Tests**: unit tests for cache eviction/revoke behavior (mock `URL.createObjectURL/revokeObjectURL`).
- **Risk**: low; behavior unchanged except memory.

### P1.2 Make storage strategy explicit and safe (B2)
- **Files**: `src/lib/storage.ts`, possibly `src/App.tsx`
- **Changes**:
  - Decide authoritative store: IndexedDB primary. Remove full-volume localStorage mirror, or replace with metadata-only fallback.
  - If keeping fallback, write compact metadata/index and load it only when IDB unavailable/fails; when IDB returns empty, check fallback and migrate.
  - Surface storage failure in dev console with clear context; optionally non-blocking UI notice for quota failure.
  - Keep export/clear behavior consistent across stores.
- **Tests**: storage tests for IDB-empty+fallback-present, quota failure, migration path.
- **Risk**: medium/data; verify no volume loss.

### P1.3 Fix binding pagination config drift (B3)
- **Files**: `src/App.tsx`, `src/lib/parser.ts` (optional helper)
- **Changes**:
  - Extract `getPaginationConfig(settings)` or equivalent single builder.
  - Use it in `paginatedPages` memo and `finishBindingAnimation`.
- **Tests**: add regression test in `bookEngine.test.ts` or new app/lib test covering fineLineHeight/fineMarginScale first-page index.
- **Risk**: low.

Exit criteria: B1-B3 fixed with tests; no tsc regressions.

## Phase 2 — Medium bugs and behavior clarity

### P2.1 Harden dev TTS proxy contract (B4, BE2)
- **Files**: `vite.config.ts`, `src/lib/tts.ts`, docs
- **Changes**:
  - Validate `text` length (reasonable cap) and required API key per provider.
  - On upstream non-2xx, read error body, return JSON `{ error, provider, status }` with appropriate status; do not pipe as audio.
  - Keep dev-only; add comment/doc: production requires real backend endpoint.
  - Client: handle JSON error responses cleanly before blob creation; preserve WebSpeech fallback where appropriate.
- **Tests**: proxy behavior can be unit-tested by extracting handler; otherwise add integration/smoke test.
- **Risk**: medium; touches read-aloud flow.

### P2.2 Align folder import supported formats (B5)
- **Files**: `src/App.tsx`, `src/components/ClosedTableView.tsx`, `src/lib/fileImporter.ts`
- **Changes**:
  - Preferred: allow supported formats (TXT/MD/PDF/EPUB/ZIP where sensible) in folder import, not text-only.
  - If intentional text-only: rename/copy to "Import folder of text files" consistently and show skipped unsupported file count.
  - Add user notice for skipped/empty imports with specific reason.
- **Tests**: extend folder import helper tests; add integration test for mixed folder.
- **Risk**: low/medium depending on product choice.

### P2.3 Clean env/docs/deps drift (B6, Q2)
- **Files**: `README.md`, `.env.example`, `package.json`, possibly `vite.config.ts`
- **Changes**:
  - Replace GEMINI_AI_STUDIO template README with actual project setup.
  - `.env.example`: `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY`; note dev proxy only.
  - Remove unused deps from `src`: `@google/genai`, `express`, `dotenv` if truly unused. Confirm test/tooling deps before removal.
  - Add privacy/deployment note for third-party TTS.
- **Tests**: `npm install`/lockfile update as needed; `tsc`; tests.
- **Risk**: low.

### P2.4 Modal a11y focus management (A1)
- **Files**: `src/components/ClosedTableView.tsx`, optionally shared hook `src/lib/useFocusTrap.ts` or component-local
- **Changes**:
  - Pending prompt and catalog dialogs: initial focus, Tab/Shift+Tab trap, Escape close/cancel, click-outside behavior preserved, restore focus to trigger on close.
  - Add `aria-describedby` where useful.
- **Tests**: component tests for Escape/focus return; manual keyboard check.
- **Risk**: low.

Exit criteria: B4-B6, A1 fixed; docs match reality.

## Phase 3 — Frontend architecture and a11y hardening

### P3.1 Extract shared book viewport/navigation hook (F2)
- **Files**: `src/components/OpenBookView.tsx`, `src/components/SettingsBookView.tsx`, new hook file
- **Changes**:
  - Extract common: viewport resize, camera memo, scroll clamp, wheel/touch processing, leaf flip, page turn cooldown, scrollY reset.
  - Keep view-specific actions (close, TOC/search/live camera) injected.
- **Tests**: existing viewport scroll tests still pass; add hook/unit tests if practical.
- **Risk**: medium; careful parity check.

### P3.2 Split large components (F1)
- **Files**: `SettingsBookView.tsx`, `OpenBookView.tsx`, `ClosedTableView.tsx`, `BookPageSheet.tsx`
- **Changes**:
  - Extract logical subcomponents: settings pages/sections, camera bar, HUD, dialogs, page header/footer, note editor, highlight controls.
  - No visual redesign; move-only refactor where possible.
- **Tests**: smoke render tests, tsc.
- **Risk**: medium regression risk; do after P3.1 or in small PRs.

### P3.3 Add error boundary (F3)
- **Files**: `src/main.tsx`, new `src/components/ErrorBoundary.tsx`
- **Changes**:
  - Catch render errors; show calm recovery UI matching aesthetic.
  - Actions: reload, return to desk/clear transient state if safe.
- **Tests**: component test with throwing child.
- **Risk**: low.

### P3.4 Shortcut/modal coordination and touch affordances (A2, A3)
- **Files**: `OpenBookView.tsx`, `SettingsBookView.tsx`, `ClosedTableView.tsx`, `BookPageSheet.tsx`
- **Changes**:
  - Global shortcut hook checks active modal/dialog state.
  - Margin annotation: visible on coarse pointer/touch or always-visible subtle icon; keep keyboard focus behavior.
- **Tests**: keyboard/modal interaction tests.
- **Risk**: low.

Exit criteria: no behavior regressions; improved maintainability/a11y.

## Phase 4 — Backend/privacy/product clarity

### P4.1 Production TTS strategy (BE1, BE3)
- **Files**: new backend endpoint/serverless handler (location depends deployment target), `src/lib/tts.ts`, UI settings copy
- **Changes**:
  - Implement `/api/tts/speak` contract for production with same request/response shape.
  - Add provider/key validation, max text length, timeout, error JSON, no key leakage.
  - Add UI disclosure: AI voices send text to selected provider; WebSpeech stays on device.
  - If backend unavailable, disable AI providers gracefully and explain.
- **Tests**: endpoint unit/integration tests; client fallback tests.
- **Risk**: medium; depends deployment environment.

### P4.2 Remove dead TTS capability code (B7)
- **Files**: `src/lib/tts.ts`
- **Changes**:
  - Remove `currentAudioResolve` or implement properly.
  - Clarify `isSpeechSupported` semantics; align UI gating.
- **Tests**: unit tests.
- **Risk**: low.

Exit criteria: production TTS path documented/implemented or explicitly gated.

## Phase 5 — Quality, performance, and verification

### P5.1 Add automated tests (Q1)
- **Files**: `package.json`, test config, new tests
- **Changes**:
  - Add Vitest + React Testing Library for component/integration tests; optionally Playwright for smoke e2e.
  - Cover: import/bind, modal keyboard/focus, TTS fallback/error, storage fallback/quota, settings pagination config, search jump.
- **Tests**: run in CI/local.
- **Risk**: low.

### P5.2 Performance pass (F4)
- **Files**: `storage.ts`, `App.tsx`, `parser.ts`
- **Changes**:
  - Debounce/throttle volume saves during rapid annotation.
  - Avoid localStorage full-volume mirror.
  - Consider chunked/workered pagination/search for very large books; only if profiling shows need.
- **Tests**: perf smoke/manual large-book check.
- **Risk**: medium.

### P5.3 Accessibility verification (A4)
- **Files**: CSS/tokens/components as needed
- **Changes**:
  - Run axe/lighthouse/contrast checks on key screens/themes.
  - Fix contrast/focus/label issues found.
- **Tests**: a11y smoke checks.
- **Risk**: low.

## Final verification checklist

- [ ] `npx tsc --noEmit` passes.
- [ ] Existing engine tests pass.
- [ ] New unit/integration tests pass.
- [ ] Manual smoke: import TXT/MD/PDF/EPUB/folder, bind, paginate, notes/highlights, search, settings, read-aloud fallback, reload persistence, keyboard-only modal flow.
- [ ] Docs/env reflect real setup and deployment constraints.
- [ ] No provider keys exposed client-side.

## Suggested execution order

1. P1.3 (small, safe)  
2. P1.1  
3. P1.2 (careful data migration)  
4. P2.4  
5. P2.2  
6. P2.1 + P4.1 design decision  
7. P2.3  
8. P3.3  
9. P3.1/P3.2 refactors  
10. P3.4, P5.1-P5.3

## Notes

- `dist/` and `node_modules/` are workspace artifacts; avoid editing/reviewing as source.
- Current baseline at audit time: `tsc --noEmit` clean, 16/16 engine tests passing.
