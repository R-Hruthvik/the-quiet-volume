---
id: RA-14
title: Tokenizers are not offset-aware
severity: medium
type: bug
area: tts-core
status: open
---

# RA-14 — Tokenizers are not offset-aware

## Problem

Sentence splitting exists in three places and returns trimmed strings with no character offsets. Word-level timing and highlighting need canonical sentence and word offsets into the chapter text.

## Evidence

- `src/lib/tts.ts:96-100` — `splitIntoSentences` returns strings only.
- `src/lib/parser.ts:670` — sentence regex in capacity normalization.
- `src/lib/parser.ts:803` — another sentence split in pagination.
- `src/components/BookPageSheet.tsx:402` — render re-joins sentences with a space, losing original whitespace.

## Impact

Character alignment from ElevenLabs cannot be mapped back to the rendered text reliably. Deepgram word interpolation has no stable offsets. Different tokenizers can disagree at the same text.

## Fix direction

- Add one canonical tokenizer returning `{ text, startChar, endChar }` for sentences and words.
- Keep `splitIntoSentences` as a compatibility wrapper.
- Use the same tokenizer for generation, cue building, and rendering.

## Acceptance criteria

- [ ] Sentence and word offsets round-trip to the original chapter text.
- [ ] Generation and rendering use the same tokenizer.
- [ ] Existing parser tests still pass.
