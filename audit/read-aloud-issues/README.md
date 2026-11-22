# Read Aloud Issues

Source audit and build plan: [`../read-aloud-audit-and-plan.md`](../read-aloud-audit-and-plan.md)
Created: 2026-11-22
Scope: read-aloud / TTS feature in `src/`, `vite.config.ts`.

Status values: `open`, `in-progress`, `done`, `wontfix`.

| ID | Severity | Type | Title | Status |
|---|---|---|---|---|
| RA-01 | High | Bug / discoverability | Read-aloud entry point buried on settings page 9 | open |
| RA-02 | High | Enhancement | No read-aloud control in reading view, chapter heading, or TOC | open |
| RA-03 | High | Bug / UX | Playback controls appear only after playback starts | open |
| RA-04 | High | Enhancement | Read-aloud is a per-spread sentence queue, not per-chapter | open |
| RA-05 | High | Enhancement | Generated audio is not saved; memory-only object URLs | open |
| RA-06 | High | Enhancement | No resume position and no seek | open |
| RA-07 | High | Enhancement | No sentence or paragraph skip | open |
| RA-08 | High | Enhancement | No word-level highlight; sentence underline only | open |
| RA-09 | High | Bug / infra | No production TTS endpoint; dev middleware only | open |
| RA-10 | High | Bug | Provider keys not loaded; failures silently fall back to device voice | open |
| RA-11 | Medium | Bug | Stop cannot cancel in-flight request; pause is not queue-level | open |
| RA-12 | Medium | Bug / infra | Audio not deleted with book; no quota or persist management | open |
| RA-13 | Medium | Bug | Manual page turn desyncs playback; paginated ids not mapped to source blocks | open |
| RA-14 | Medium | Bug / architecture | Tokenizers are not offset-aware | open |
| RA-15 | Medium | Bug / security | Dev TTS proxy lacks key, status, and size guards | open |
| RA-16 | Low | Enhancement | Voice change does not invalidate or regenerate saved audio | open |
| RA-17 | Low | Bug / privacy | No disclosure that chapter text is sent to the TTS provider | open |
| RA-18 | Low | Test gap | No tests for TTS generation, persistence, sync, or cleanup | open |
| RA-19 | Low | Build | `dist/` is stale relative to `src/` | open |

## Suggested order

1. RA-10, RA-09 (make generation work and fail loudly)
2. RA-01, RA-02, RA-03 (make the feature discoverable)
3. RA-14, RA-04 (chapter text and generation model)
4. RA-05, RA-06, RA-12 (persist, resume, clean up)
5. RA-08, RA-07, RA-13 (word sync, skip, page follow)
6. RA-11, RA-15, RA-16, RA-17 (hardening)
7. RA-18, RA-19 (verification)
