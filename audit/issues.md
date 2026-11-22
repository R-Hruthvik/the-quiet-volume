# The Quiet Volume — Audit Issues

Audit date: 2026-05-17  
Scope: `src/` codebase map + code review, bug review, FE/BE review, a11y review.  
Checks run:
- `npx tsc --noEmit` — clean
- `node --import tsx --test src/lib/bookEngine.test.ts` — 16/16 passing

## 1. Codebase map

| Area | Files | Responsibility |
|---|---|---|
| Entrypoint | `src/main.tsx`, `index.html` | Mount React app, fonts/meta. |
| App orchestration | `src/App.tsx` | Library state, persistence, import/binding, pagination, read-aloud, view routing. |
| Types | `src/types/book.ts` | BookVolume/block/pagination/settings/TTS/identity types. |
| Import/parse | `src/lib/fileImporter.ts`, `src/lib/parser.ts`, `src/lib/sampleVolumes.ts` | File extraction (TXT/MD/PDF/EPUB/ZIP/folder), normalization, block/section parse, pagination, search, progress. |
| Layout/camera/scroll | `src/lib/dimensions.ts`, `src/lib/viewportScroll.ts` | Physical book metrics, camera transform, desktop table layout, scroll-before-flip state machine. |
| Persistence | `src/lib/storage.ts` | IndexedDB volumes, localStorage fallback/mirror, settings, markdown export. |
| Visual/theme | `src/lib/lighting.ts`, `src/lib/identity.ts`, `src/index.css` | Paper/lighting/environment specs, deterministic book identity, textures/rulings/animations. |
| Audio/TTS | `src/lib/sound.ts`, `src/lib/tts.ts` | UI sound effects; Deepgram/ElevenLabs via `/api/tts/speak`, WebSpeech fallback. |
| Views/components | `src/components/*` | Desk/table, binding, open book, settings handbook, page sheet, front/end matter, ornaments, environment. |
| Dev/build config | `vite.config.ts`, `tsconfig.json`, `package.json` | Vite plugins, dev TTS proxy middleware, TS config, deps/scripts. |

Architecture: local-first React SPA. No production backend; TTS backend exists only as Vite dev middleware.

## 2. Bugs and correctness risks

### B1 — High: TTS audio blob URL cache leaks memory
- **Where**: `src/lib/tts.ts:107,198-221`
- **Issue**: `audioCache` stores `URL.createObjectURL(blob)` values and never revokes them. Long read-aloud sessions accumulate blobs/URLs.
- **Impact**: Growing memory use, degraded performance on long sessions/mobile.
- **Fix direction**: Add bounded LRU cache; revoke evicted/cleared URLs; expose cleanup on stop/unmount where appropriate.

### B2 — High: Volume persistence mirrors full data to localStorage
- **Where**: `src/lib/storage.ts:54-73,100-106,123-150`
- **Issue**: `saveVolume` writes to IndexedDB then always mirrors full volume JSON to localStorage fallback. Quota/serialization failures are swallowed. `loadVolumes` returns IDB result on success even when empty, ignoring fallback mirror.
- **Impact**: Large books can exceed localStorage quota; silent fallback failure; possible missing data when IDB is empty but fallback has volumes.
- **Fix direction**: Make storage authoritative/explicit. Avoid full-volume localStorage mirror for large data; store metadata-only fallback or use IDB as sole source with migration. If fallback kept, load fallback when IDB empty and merge carefully.

### B3 — High: Binding completion pagination omits fine spacing settings
- **Where**: `src/App.tsx:149-169,261-297`
- **Issue**: `paginatedPages` memo includes `fineLineHeight` and `fineMarginScale`; `finishBindingAnimation` calls `paginateBook` without them.
- **Impact**: Newly bound book can open at wrong page/block when fine spacing is customized.
- **Fix direction**: Centralize pagination config builder used by both memo and binding completion; add regression test.

### B4 — Medium: Dev TTS proxy lacks key/status/input guards
- **Where**: `vite.config.ts:14-112`, `src/lib/tts.ts:201-246`
- **Issue**: Proxy sends requests even when keys missing; on non-2xx upstream it writes status but always pipes body as `audio/mpeg`. No request body size/text length limit. Dev-only endpoint.
- **Impact**: Confusing failures, potential audio error payload playback, avoidable local abuse/cost risk if exposed.
- **Fix direction**: Validate provider/key presence; return JSON error on non-2xx; enforce max text length; document dev-only/prod backend requirement.

### B5 — Medium: Folder/multi import drops supported non-text formats
- **Where**: `src/App.tsx:304-312`, `src/lib/fileImporter.ts:338-377`
- **Issue**: For folder/multi-file import, App filters to text-only files before reading. `readDroppedFilesLocally` supports TXT/MD/PDF/EPUB/ZIP.
- **Impact**: PDFs/EPUBs inside selected folder are silently excluded, contrary to supported formats.
- **Fix direction**: Decide intended behavior. Either support all supported formats in folder import, or explicitly UI-copy/validate as text-only and report skipped files.

### B6 — Medium: Environment/doc/config drift
- **Where**: `README.md`, `.env.example`, `package.json:13-37`, `vite.config.ts:35-88`
- **Issue**: README/.env.example reference `GEMINI_API_KEY`; app uses `DEEPGRAM_API_KEY`/`ELEVENLABS_API_KEY`. Unused deps in `src/`: `@google/genai`, `express`, `dotenv` (and likely `esbuild`/`tsx` only needed for tests/tooling - confirm). 
- **Impact**: Setup confusion, misleading deploy expectations, unnecessary dependency surface.
- **Fix direction**: Update docs/env example to real keys; remove or justify unused deps; add note that AI TTS needs backend/proxy.

### B7 — Low: TTS dead/inaccurate capability code
- **Where**: `src/lib/tts.ts:102-128,109-120`
- **Issue**: `currentAudioResolve` is cleared but never assigned. `isSpeechSupported()` returns true if `Audio` exists even when WebSpeech unavailable; capability semantics unclear.
- **Impact**: Minor dead code/confusion; possible false-positive support checks.
- **Fix direction**: Remove dead field or implement it; clarify `isSpeechSupported` contract and callers.

### B8 — Low: Untyped browser File System Access/webkit traversal
- **Where**: `src/components/ClosedTableView.tsx:56-57,145-196`, `src/lib/fileImporter.ts:280-335`
- **Issue**: `any` used for directory picker and webkit entry traversal.
- **Impact**: Reduced type safety; harder refactors.
- **Fix direction**: Add narrow local types/interfaces for used APIs; isolate in helper.

## 3. Frontend review

### F1 — Medium: Large monolithic components
- **Where**: `src/components/SettingsBookView.tsx` (~1927), `src/components/OpenBookView.tsx` (~1197), `src/components/ClosedTableView.tsx` (~959), `src/components/BookPageSheet.tsx` (~812), `src/App.tsx` (~761)
- **Issue**: Many responsibilities per file; difficult to reason about regressions.
- **Impact**: Maintenance cost, review risk, harder testing.
- **Fix direction**: Extract page sections, controls, dialogs, hooks (camera/keyboard/scroll/TTS orchestration).

### F2 — Medium: Duplicated camera/turn/scroll behavior
- **Where**: `src/components/OpenBookView.tsx`, `src/components/SettingsBookView.tsx`
- **Issue**: Both implement similar viewport resize, camera memo, scroll clamp, wheel/touch handling, leaf flip, keyboard nav.
- **Impact**: Behavior drift bugs.
- **Fix direction**: Extract shared `useBookViewportNavigation` hook/utilities with configurable page count/actions.

### F3 — Medium: No error boundary/resilient failure UI
- **Where**: `src/main.tsx`, app shell
- **Issue**: Render/import/pagination errors can blank the app.
- **Impact**: Poor recovery for malformed files or unexpected runtime errors.
- **Fix direction**: Add top-level error boundary with "return to desk/reload" action; log error details locally.

### F4 — Low: Performance hotspots for large volumes
- **Where**: `src/App.tsx:149-169`, `src/lib/parser.ts`, `src/lib/storage.ts:100-106`
- **Issue**: Pagination/search on main thread; frequent full-volume saves mirror to localStorage.
- **Impact**: Jank on large books/frequent annotations.
- **Fix direction**: Debounce saves, persist diffs/patches where possible, consider worker for pagination/search on large volumes.

## 4. Backend / infra review

### BE1 — High: No production TTS backend
- **Where**: `vite.config.ts:14-112`, `src/lib/tts.ts:201-246`
- **Issue**: Client calls `/api/tts/speak`; only Vite dev middleware handles it. Static production build has no equivalent endpoint.
- **Impact**: AI read-aloud fails in production unless separately implemented.
- **Fix direction**: Provide production serverless/server endpoint with same contract, or clearly gate feature and document deployment.

### BE2 — Medium: Dev proxy security/cost posture
- **Where**: `vite.config.ts:14-112`
- **Issue**: No auth/rate limit/text max length/provider allowlist beyond basic method check.
- **Impact**: If exposed beyond local dev, key misuse/cost risk.
- **Fix direction**: Add input limits, key checks, structured errors, and explicit dev-only warning/docs.

### BE3 — Low: Privacy disclosure gap
- **Where**: UI/docs around TTS settings
- **Issue**: Local-first app sends read-aloud text to third-party TTS providers when AI voices selected.
- **Impact**: User expectation mismatch.
- **Fix direction**: Add concise disclosure near voice settings; note WebSpeech is device-local.

## 5. Accessibility review

### A1 — High: Modal dialogs lack focus management
- **Where**: `src/components/ClosedTableView.tsx:831-956`
- **Issue**: Pending prompt and catalog dialogs have dialog semantics but no focus trap, no Escape handling, no initial focus, no focus restore on close.
- **Impact**: Keyboard and screen-reader users can escape into background content; poor modal UX.
- **Fix direction**: Add focus trap, `Escape` to close/cancel, focus first meaningful control, restore trigger focus on close.

### A2 — Medium: Global keyboard shortcuts need modal coordination
- **Where**: `src/components/OpenBookView.tsx:404-521`, `src/components/SettingsBookView.tsx:299-386`
- **Issue**: Global key handlers capture navigation/zoom keys; they ignore editable targets, but modal/overlay states across views should be consistently guarded.
- **Impact**: Potential unintended page turns/actions when overlays active.
- **Fix direction**: Centralize shortcut guard; disable background shortcuts when modal open.

### A3 — Medium: Touch discoverability of margin annotation
- **Where**: `src/components/BookPageSheet.tsx:341-356`
- **Issue**: Annotation button is opacity-0 until hover/focus; touch users may not discover it. Focus-visible helps keyboard, not touch.
- **Impact**: Feature discoverability on mobile/tablet.
- **Fix direction**: Show subtle persistent affordance on touch/coarse pointer, or provide alternate block action menu.

### A4 — Low: Contrast/visual-state verification needed
- **Where**: `src/index.css`, `src/lib/lighting.ts`, highlight/ruling styles in `BookPageSheet.tsx`
- **Issue**: Multiple paper/lighting/highlight combinations; not all verified against WCAG contrast.
- **Impact**: Possible low contrast in some themes/rulings/highlights.
- **Fix direction**: Run automated contrast checks for key combinations; adjust token colors where needed.

## 6. Code quality / testing gaps

### Q1 — Medium: Test coverage limited to lib engine
- **Where**: `src/lib/bookEngine.test.ts` only
- **Issue**: No component/integration tests for import flow, dialogs, TTS fallback/errors, persistence fallback/quota, keyboard/a11y behaviors.
- **Impact**: Regressions likely in UI flows.
- **Fix direction**: Add Vitest + Testing Library/Playwright smoke tests for critical flows.

### Q2 — Low: Dead/unused dependencies and template leftovers
- **Where**: `package.json`, `README.md`, `.env.example`, `dist/`
- **Issue**: Unused deps/docs mismatch; AI Studio template README remains.
- **Impact**: Confusion and maintenance noise.
- **Fix direction**: Clean deps/docs; keep `dist/` out of source review scope or gitignore/generated policy as intended.

## 7. Positive notes

- Solid local-first model and clear user-facing privacy copy in bookplate.
- Good deterministic identity/layout/viewport engines with tests.
- Reduced motion/texture settings exist and are wired through many surfaces.
- Keyboard navigation is broad and generally guards editable targets.
- TypeScript check and existing engine tests pass.
