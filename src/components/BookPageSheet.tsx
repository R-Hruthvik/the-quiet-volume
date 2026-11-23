import React, { useState } from 'react';
import { splitIntoSentences } from '../lib/tts';
import { BookplatePage, TitlePage, TocPage } from './FrontMatterPages';
import { FinalEndpaperPage } from './FinalEndpaperPage';
import type {
  BookBlock,
  BookVolume,
  HighlightKind,
  MarginNote,
  PaginatedPage,
  PaperRuling,
  ReaderSettings,
} from '../types/book';
import { getPaperSpec, type PaperSpec } from '../lib/lighting';

interface BookPageSheetProps {
  page: PaginatedPage | null;
  side: 'left' | 'right';
  isFocusedSide?: boolean;
  volume: BookVolume;
  totalVolumesCount: number;
  settings: ReaderSettings;
  paper?: PaperSpec;
  gutterOpacity: number;
  isDogEared: boolean;
  resumeBlockId?: string | null;
  activeSpeechCue?: { blockId: string; sentenceIndex: number } | null;
  onToggleDogEar: (pageIndex: number) => void;
  onAddOrUpdateNote: (blockId: string, text: string, existingId?: string) => void;
  onDeleteNote: (noteId: string) => void;
  onToggleNoteFold: (noteId: string) => void;
  onSetHighlight: (blockId: string, kind: HighlightKind | null) => void;
  onSelectTocPage: (displayPageNumber: number) => void;
  onSaveFinalThought: (thought: string) => void;
  onCloseBook: () => void;
  onOpenBackCover: () => void;
  onRemoveVolume: (id: string) => void;
  onEmptyReadingRoom: () => void;
  onJumpToToc: () => void;
  onStartReadAloud?: (pageIndex: number) => void;
  onRecordChapter?: (sectionIndex: number) => void;
  savedChapterIndices?: number[];
  recordingSectionIndex?: number | null;
  recordingProgressText?: string | null;
  onPlayRecordedChapter?: (sectionIndex: number) => void;
}

function getWritingHandClass(hand: ReaderSettings['writingHand']): string {
  switch (hand) {
    case 'kalam':
      return 'font-hand-kalam';
    case 'patrick':
      return 'font-hand-patrick';
    case 'caveat':
      return 'font-hand-caveat';
    case 'serif':
      return 'font-book-serif';
  }
}

function getFontSizePx(size: ReaderSettings['writingSize'], hand: ReaderSettings['writingHand']): number {
  const baseMap: Record<ReaderSettings['writingSize'], number> = {
    small: 13.5,
    compact: 14.8,
    natural: 16,
    comfortable: 17.6,
    large: 19.8,
  };
  const handBoost = hand === 'caveat' ? 3.2 : hand === 'patrick' ? 1.0 : 0;
  return baseMap[size] + handBoost;
}

function getSpacingStyles(
  settings: ReaderSettings,
  side: 'left' | 'right'
): {
  lineHeight: number;
  paragraphGap: string;
  paddingStyle: React.CSSProperties;
} {
  const isNotebook = settings.pageFormat === 'notebook';
  const hasMarginLine = settings.paperRuling === 'margin-lined';

  const defaults = isNotebook
    ? {
        close: { lineHeight: 1.5, paragraphGap: '0.42rem', outer: 16, inner: 24, top: 12, bottom: 14 },
        natural: { lineHeight: 1.64, paragraphGap: '0.56rem', outer: 20, inner: 28, top: 14, bottom: 16 },
        airy: { lineHeight: 1.8, paragraphGap: '0.74rem', outer: 26, inner: 32, top: 18, bottom: 20 },
      }[settings.pageSpacing]
    : {
        close: { lineHeight: 1.50, paragraphGap: '0.18rem', outer: 26, inner: 32, top: 18, bottom: 12 },
        natural: { lineHeight: 1.62, paragraphGap: '0.22rem', outer: 30, inner: 36, top: 22, bottom: 14 },
        airy: { lineHeight: 1.74, paragraphGap: '0.30rem', outer: 34, inner: 38, top: 24, bottom: 16 },
      }[settings.pageSpacing];

  const mScale = settings.fineMarginScale || 1;
  const padLeft = Math.round(
    (side === 'left' ? defaults.outer : defaults.inner + (hasMarginLine ? 14 : 0)) * mScale
  );
  const padRight = Math.round(
    (side === 'right' ? defaults.outer : defaults.inner + (hasMarginLine ? 14 : 0)) * mScale
  );

  return {
    lineHeight: settings.fineLineHeight || defaults.lineHeight,
    paragraphGap: defaults.paragraphGap,
    paddingStyle: {
      paddingLeft: `${padLeft}px`,
      paddingRight: `${padRight}px`,
      paddingTop: `${Math.round(defaults.top * mScale)}px`,
      paddingBottom: `${Math.round(defaults.bottom * mScale)}px`,
    },
  };
}

function getHighlightStyle(kind: HighlightKind | undefined, isDarkPaper: boolean): React.CSSProperties {
  if (!kind) return {};
  switch (kind) {
    case 'pencil':
      return {
        textDecoration: 'underline',
        textDecorationColor: isDarkPaper ? 'rgba(220, 212, 196, 0.55)' : 'rgba(92, 82, 70, 0.55)',
        textDecorationThickness: '1.5px',
        textUnderlineOffset: '4px',
      };
    case 'red-pencil':
      return {
        textDecoration: 'underline',
        textDecorationColor: isDarkPaper ? 'rgba(218, 120, 108, 0.72)' : 'rgba(164, 62, 52, 0.65)',
        textDecorationThickness: '1.5px',
        textUnderlineOffset: '4px',
      };
    case 'ink-wash':
      return {
        backgroundColor: isDarkPaper ? 'rgba(182, 166, 134, 0.14)' : 'rgba(166, 148, 114, 0.16)',
        borderRadius: '2px',
        padding: '0 2px',
      };
    case 'highlighter':
      return {
        backgroundColor: isDarkPaper ? 'rgba(214, 198, 92, 0.22)' : 'rgba(245, 229, 132, 0.48)',
        borderRadius: '2px',
      };
    case 'bracket':
      return {};
  }
}

function getRulingClass(ruling: PaperRuling): string {
  switch (ruling) {
    case 'lined':
    case 'margin-lined':
      return 'ruling-lined';
    case 'dot-grid':
      return 'ruling-dot-grid';
    case 'graph':
      return 'ruling-graph';
    case 'plain':
      return '';
  }
}

export function BookPageSheet({
  page,
  side,
  volume,
  totalVolumesCount,
  settings,
  paper: rawPaper,
  gutterOpacity,
  isDogEared,
  resumeBlockId,
  activeSpeechCue,
  onToggleDogEar,
  onAddOrUpdateNote,
  onDeleteNote,
  onToggleNoteFold,
  onSetHighlight,
  onSelectTocPage,
  onSaveFinalThought,
  onCloseBook,
  onOpenBackCover,
  onRemoveVolume,
  onEmptyReadingRoom,
  onJumpToToc,
  onStartReadAloud,
  onRecordChapter,
  savedChapterIndices,
  recordingSectionIndex,
  recordingProgressText,
  onPlayRecordedChapter,
}: BookPageSheetProps) {
  const paper = rawPaper && rawPaper.pageBg ? rawPaper : getPaperSpec(rawPaper?.id || settings?.paper);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState('');

  const isNotebook = settings.pageFormat === 'notebook';
  const handClass = getWritingHandClass(settings.writingHand);
  const bodyFontSize = getFontSizePx(settings.writingSize, settings.writingHand);
  const spacing = getSpacingStyles(settings, side);

  const pageTint = side === 'left' ? paper.pageLeftTint : paper.pageRightTint;

  // Realistic 3D convex page arch + spine valley shadow + outer fore-edge falloff
  const pageArchShading =
    side === 'left'
      ? `linear-gradient(to left,
          ${paper.gutterShadow} 0%,
          rgba(35, 26, 16, ${paper.isDarkPaper ? 0.22 : 0.08}) 5.5%,
          rgba(255, 253, 246, ${paper.isDarkPaper ? 0.03 : 0.22}) 24%,
          transparent 56%,
          rgba(30, 22, 14, ${paper.isDarkPaper ? 0.14 : 0.035}) 100%)`
      : `linear-gradient(to right,
          ${paper.gutterShadow} 0%,
          rgba(35, 26, 16, ${paper.isDarkPaper ? 0.22 : 0.08}) 5.5%,
          rgba(255, 253, 246, ${paper.isDarkPaper ? 0.04 : 0.28}) 26%,
          transparent 60%,
          rgba(30, 22, 14, ${paper.isDarkPaper ? 0.16 : 0.04}) 100%)`;

  const notesByBlock = new Map<string, MarginNote[]>();
  for (const n of volume.notes) {
    const arr = notesByBlock.get(n.blockId) || [];
    arr.push(n);
    notesByBlock.set(n.blockId, arr);
  }

  const openMarginEditor = (blockId: string) => {
    const existing = notesByBlock.get(blockId)?.[0];
    setEditingBlockId(blockId);
    setDraftNote(existing?.text || '');
  };

  const commitNote = (blockId: string) => {
    const existing = notesByBlock.get(blockId)?.[0];
    const trimmed = draftNote.trim();
    if (trimmed) {
      onAddOrUpdateNote(blockId, trimmed, existing?.id);
    } else if (existing) {
      onDeleteNote(existing.id);
    }
    setEditingBlockId(null);
    setDraftNote('');
  };

  const renderBlockContent = (block: BookBlock) => {
    const highlightKind = volume.highlights[block.id];
    const isBracket = highlightKind === 'bracket';
    const isResumeLine = resumeBlockId === block.id;
    const isSpeakingBlock = activeSpeechCue?.blockId === block.id;
    const blockNotes = notesByBlock.get(block.id) || [];
    const isEditing = editingBlockId === block.id;

    if (block.kind === 'scene-break') {
      return (
        <div
          key={block.id}
          aria-hidden="true"
          className="my-2.5 text-center text-sm tracking-[0.45em] opacity-55"
          style={{ color: paper.pencilInk }}
        >
          {isNotebook ? '— · —' : '❦'}
        </div>
      );
    }

    if (block.kind === 'chapter-title') {
      return (
        <div key={block.id} className="group flex items-baseline justify-between gap-3">
          <h2
            className={
              isNotebook
                ? 'font-hand-caveat mb-2 mt-0.5 border-b pb-1 text-[23px] font-medium leading-tight [text-wrap:balance]'
                : 'font-hand-caveat mb-3 mt-1 text-[28px] font-medium leading-tight [text-wrap:balance]'
            }
            style={{
              color: paper.ink,
              borderColor: isNotebook ? `${paper.ink}1A` : undefined,
            }}
          >
            {block.text}
          </h2>
          {page && (
            <div className="flex items-center gap-1 shrink-0">
              {page.sectionIndex !== undefined && recordingSectionIndex === page.sectionIndex ? (
                <span
                  className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-hand-kalam text-xs animate-pulse font-medium shadow-sm"
                  style={{ color: paper.pencilInk, backgroundColor: `${paper.ink}12` }}
                >
                  <span className="inline-block animate-spin text-[10px]">⏳</span>
                  <span>{recordingProgressText || 'Converting...'}</span>
                </span>
              ) : page.sectionIndex !== undefined && savedChapterIndices?.includes(page.sectionIndex) ? (
                <>
                  {onPlayRecordedChapter && (
                    <button
                      type="button"
                      onClick={() => onPlayRecordedChapter(page.sectionIndex!)}
                      title="Play full chapter audio (with live sentence highlighting)"
                      aria-label="Play full chapter audio"
                      className="flex min-h-[36px] items-center gap-1.5 rounded-full px-2.5 py-1 font-hand-kalam text-xs font-medium border transition-all cursor-pointer touch-manipulation hover:scale-105 active:scale-95 shadow-sm"
                      style={{
                        color: paper.ink,
                        borderColor: `${paper.ink}35`,
                        backgroundColor: `${paper.ink}12`,
                      }}
                    >
                      <span>🎧</span>
                      <span>Play Audio</span>
                    </button>
                  )}
                  {onRecordChapter && (
                    <button
                      type="button"
                      onClick={() => onRecordChapter(page.sectionIndex!)}
                      title="Re-record chapter MP3"
                      aria-label="Re-record chapter MP3"
                      className="flex min-h-[36px] items-center gap-1 rounded px-2 py-1 font-hand-kalam text-xs opacity-50 hover:opacity-100 transition-opacity hover:bg-black/5 cursor-pointer touch-manipulation"
                      style={{ color: paper.pencilInk }}
                    >
                      <span>⏺</span>
                      <span className="hidden sm:inline">Re-record</span>
                    </button>
                  )}
                </>
              ) : (
                <>
                  {onRecordChapter && page.sectionIndex !== undefined && (
                    <button
                      type="button"
                      onClick={() => onRecordChapter(page.sectionIndex!)}
                      title="Record full chapter as single MP3 file to disk"
                      aria-label="Record full chapter as single MP3 file to disk"
                      className="flex min-h-[36px] items-center gap-1 rounded px-2 py-1 font-hand-kalam text-xs opacity-60 hover:opacity-100 transition-opacity hover:bg-black/5 cursor-pointer touch-manipulation"
                      style={{ color: paper.pencilInk }}
                    >
                      <span>⏺</span>
                      <span className="hidden sm:inline">Record MP3</span>
                    </button>
                  )}
                  {onStartReadAloud && (
                    <button
                      type="button"
                      onClick={() => onStartReadAloud(page.index)}
                      title="Listen to this chapter"
                      aria-label="Listen to this chapter"
                      className="flex min-h-[36px] items-center gap-1 rounded px-2 py-1 font-hand-kalam text-xs opacity-60 hover:opacity-100 transition-opacity hover:bg-black/5 cursor-pointer touch-manipulation"
                      style={{ color: paper.pencilInk }}
                    >
                      <span>🔊</span>
                      <span className="hidden sm:inline">Listen</span>
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      );
    }

    if (block.kind === 'source-note') {
      return (
        <p
          key={block.id}
          className="mb-2.5 font-hand-patrick text-[11px] italic"
          style={{ color: paper.pencilInk }}
        >
          {block.text}
        </p>
      );
    }

    if (block.kind === 'heading') {
      return (
        <h3
          key={block.id}
          className={`${handClass} mb-1.5 mt-2.5 text-[17.5px] font-medium leading-snug`}
          style={{ color: paper.ink }}
        >
          {block.text}
        </h3>
      );
    }

    if (block.kind === 'code') {
      return (
        <pre
          key={block.id}
          className="font-book-mono my-2.5 overflow-x-auto rounded-[2px] border px-2.5 py-2 text-[10.5px] leading-relaxed"
          style={{
            borderColor: `${paper.ink}18`,
            backgroundColor: paper.isDarkPaper ? 'rgba(255,255,255,0.03)' : 'rgba(40,32,22,0.035)',
            color: paper.ink,
          }}
        >
          <code>{block.text}</code>
        </pre>
      );
    }

    const sentences = isSpeakingBlock ? splitIntoSentences(block.text) : null;
    const effectiveFontClass =
      block.technical && settings.writingHand === 'caveat' ? 'font-book-serif' : handClass;
    const useDropCap = !isNotebook && Boolean(block.dropCap);

    return (
      <div
        key={block.id}
        className="group relative"
        style={{ marginBottom: spacing.paragraphGap }}
      >
        {isResumeLine && (
          <span
            aria-hidden="true"
            className="animate-resume-pencil pointer-events-none absolute -left-3.5 top-1 font-hand-caveat text-base"
            style={{ color: volume.identity.ribbonColor }}
          >
            –
          </span>
        )}

        {isBracket && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -left-2.5 inset-y-0.5 w-1.5 border-l border-t border-b rounded-l-[1px]"
            style={{ borderColor: `${paper.pencilInk}99` }}
          />
        )}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openMarginEditor(block.id);
          }}
          aria-label="Write margin note or underline paragraph"
          className={`absolute top-0.5 z-10 flex h-7 w-7 sm:h-5 sm:w-5 items-center justify-center rounded-full text-center font-hand-caveat text-xs opacity-40 transition-opacity sm:opacity-0 sm:group-hover:opacity-65 hover:!opacity-100 focus-visible:opacity-100 before:absolute before:-inset-2 before:content-[''] touch-manipulation ${
            side === 'left' ? '-left-3.5 sm:-left-4' : '-right-3.5 sm:-right-4'
          }`}
          style={{ color: paper.pencilInk }}
          title="Annotate in margin"
        >
          ✎
        </button>

        {block.kind === 'quote' ? (
          <blockquote
            className={`${effectiveFontClass} hand-glyph-subtle my-2 px-3 py-1 italic`}
            style={{
              fontSize: `${bodyFontSize - 0.5}px`,
              lineHeight: spacing.lineHeight,
              color: paper.mutedInk,
              borderTop: `1px solid ${paper.ink}15`,
              borderBottom: `1px solid ${paper.ink}15`,
              ...getHighlightStyle(highlightKind, paper.isDarkPaper),
            }}
          >
            {block.text}
          </blockquote>
        ) : (
          <p
            className={`${effectiveFontClass} hand-glyph-subtle ${
              useDropCap
                ? 'first-letter:float-left first-letter:mr-2 first-letter:mt-0.5 first-letter:font-hand-caveat first-letter:text-[2.6rem] first-letter:leading-[0.82]'
                : ''
            }`}
            style={{
              fontSize: `${bodyFontSize}px`,
              lineHeight: spacing.lineHeight,
              color: paper.ink,
              textIndent: !isNotebook && !useDropCap ? '1.4em' : undefined,
              letterSpacing: paper.isDarkPaper ? '0.012em' : undefined,
              ...getHighlightStyle(highlightKind, paper.isDarkPaper),
            }}
          >
            {sentences
              ? sentences.map((s, sIdx) => (
                  <span
                    key={sIdx}
                    style={
                      sIdx === activeSpeechCue?.sentenceIndex
                        ? {
                            textDecoration: 'underline',
                            textDecorationStyle: 'dotted',
                            textDecorationColor: volume.identity.ribbonColor,
                            textUnderlineOffset: '4px',
                          }
                        : undefined
                    }
                  >
                    {s}{' '}
                  </span>
                ))
              : block.text}
          </p>
        )}

        {blockNotes.map((note) => {
          const isLong = note.text.length > 58;
          const folded = Boolean(note.folded);
          return (
            <div
              key={note.id}
              className="mt-1 mb-1 flex items-start gap-2 rounded-[2px] border border-dashed px-2 py-1"
              style={{
                borderColor: `${paper.pencilInk}40`,
                backgroundColor: paper.isDarkPaper
                  ? 'rgba(255,255,255,0.03)'
                  : 'rgba(120, 106, 86, 0.06)',
                color: paper.pencilInk,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <span aria-hidden="true" className="font-hand-caveat text-xs opacity-70">
                ✎
              </span>
              <div className="min-w-0 flex-1">
                {folded ? (
                  <button
                    type="button"
                    onClick={() => onToggleNoteFold(note.id)}
                    className="font-hand-kalam text-xs underline decoration-dotted underline-offset-2"
                  >
                    Unfold margin note…
                  </button>
                ) : (
                  <p className="font-hand-kalam text-[12.5px] leading-snug">{note.text}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2 font-hand-patrick text-[11px] opacity-70">
                {isLong && (
                  <button
                    type="button"
                    onClick={() => onToggleNoteFold(note.id)}
                    className="hover:opacity-100"
                  >
                    {folded ? 'open' : 'fold'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => openMarginEditor(block.id)}
                  className="hover:opacity-100"
                >
                  edit
                </button>
              </div>
            </div>
          );
        })}

        {isEditing && (
          <div
            className="mt-1.5 w-full max-w-full box-border rounded-[2px] border p-2.5 shadow-sm"
            style={{
              backgroundColor: paper.pageBg,
              borderColor: `${paper.ink}28`,
              color: paper.ink,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-center gap-2 pb-1.5 text-[11px] font-hand-patrick">
              <span style={{ color: paper.pencilInk }}>Mark:</span>
              {(
                [
                  { id: 'pencil', label: 'Pencil' },
                  { id: 'red-pencil', label: 'Red pencil' },
                  { id: 'ink-wash', label: 'Ink wash' },
                  { id: 'bracket', label: 'Bracket' },
                  { id: 'highlighter', label: 'Wash yellow' },
                ] as { id: HighlightKind; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() =>
                    onSetHighlight(block.id, highlightKind === opt.id ? null : opt.id)
                  }
                  className="inline-flex min-h-[36px] sm:min-h-[44px] items-center justify-center rounded-[2px] px-2.5 py-1.5 transition-opacity hover:opacity-100 touch-manipulation cursor-pointer"
                  style={{
                    textDecoration: highlightKind === opt.id ? 'underline' : 'none',
                    opacity: highlightKind === opt.id ? 1 : 0.65,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <label className="sr-only" htmlFor={`margin-note-${block.id}`}>
              Margin note
            </label>
            <textarea
              id={`margin-note-${block.id}`}
              rows={2}
              autoFocus
              value={draftNote}
              onChange={(e) => setDraftNote(e.target.value)}
              placeholder="Write in the margin…"
              className="w-full max-w-full box-border resize-none border-t bg-transparent p-2 pt-2.5 font-hand-kalam text-sm leading-snug focus:outline-none"
              style={{ borderColor: `${paper.ink}18`, color: paper.ink }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  commitNote(block.id);
                } else if (e.key === 'Escape') {
                  e.stopPropagation();
                  setEditingBlockId(null);
                }
              }}
            />
            <div className="mt-1 flex flex-wrap items-center justify-end gap-2 font-hand-patrick text-xs">
              <button
                type="button"
                onClick={() => setEditingBlockId(null)}
                className="inline-flex min-h-[36px] sm:min-h-[44px] items-center justify-center px-2.5 py-1.5 touch-manipulation cursor-pointer hover:opacity-100 opacity-80"
                style={{ color: paper.pencilInk }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => commitNote(block.id)}
                className="inline-flex min-h-[36px] sm:min-h-[44px] items-center justify-center px-2.5 py-1.5 underline decoration-dotted underline-offset-4 touch-manipulation cursor-pointer hover:opacity-100"
                style={{ color: paper.ink }}
                title="Save note"
              >
                Save note
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (!page) {
    return (
      <div
        className="relative h-full w-full"
        style={{ backgroundColor: pageTint }}
        aria-hidden="true"
      />
    );
  }

  const showRuling = page.kind === 'content' && settings.paperRuling !== 'plain';
  const showMarginRule = page.kind === 'content' && settings.paperRuling === 'margin-lined';

  return (
    <section
      className="relative flex h-full w-full flex-col overflow-hidden"
      style={{ backgroundColor: pageTint }}
      aria-label={
        page.displayNumber !== null
          ? `Page ${page.displayNumber}`
          : page.kind === 'front-bookplate'
          ? 'Inside front cover bookplate'
          : page.kind === 'title-page'
          ? 'Title page'
          : page.kind === 'toc'
          ? 'Table of contents'
          : page.kind === 'endpaper'
          ? 'Final endpaper'
          : 'Blank verso page'
      }
    >
      {/* Tactile cotton paper fiber texture overlay */}
      {!settings.reducedTexture && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 z-[2] ${
            paper.isDarkPaper ? 'texture-paper-dark' : 'texture-paper-grain'
          }`}
        />
      )}

      {/* Optional Paper Ruling (Plain by default; Lined / Margin-ruled / Dot-grid / Graph via settings) */}
      {showRuling && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 z-[3] ${getRulingClass(
            settings.paperRuling
          )}`}
          style={
            {
              '--rule-line': paper.isDarkPaper
                ? 'rgba(205, 198, 188, 0.14)'
                : 'rgba(108, 122, 142, 0.22)',
              '--rule-dot': paper.isDarkPaper
                ? 'rgba(210, 202, 190, 0.22)'
                : 'rgba(108, 98, 86, 0.28)',
            } as React.CSSProperties
          }
        />
      )}

      {/* Classic Notebook Vertical Margin Rule (only when Margin-ruled is enabled) */}
      {showMarginRule && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 z-[4] w-[3px] border-x"
            style={{
              [side === 'left' ? 'right' : 'left']: '28px',
              borderColor: paper.isDarkPaper
                ? 'rgba(196, 114, 110, 0.28)'
                : 'rgba(182, 92, 96, 0.34)',
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-[36px] z-[4] h-[3px] border-y"
            style={{
              borderColor: paper.isDarkPaper
                ? 'rgba(196, 114, 110, 0.28)'
                : 'rgba(182, 92, 96, 0.34)',
            }}
          />
        </>
      )}

      {/* 3D Page Curvature & Spine Valley Shading */}
      {!settings.reducedTexture && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            background: pageArchShading,
            opacity: gutterOpacity,
          }}
        />
      )}

      {/* Dog-ear Bookmark Corner (or Accessibility Colored Ribbon) */}
      {page.kind === 'content' && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleDogEar(page.index);
          }}
          aria-label={
            isDogEared
              ? `Remove bookmark on page ${page.displayNumber}`
              : `Dog-ear bookmark page ${page.displayNumber}`
          }
          aria-pressed={isDogEared}
          className={`group absolute top-0 z-20 h-11 w-11 min-h-[44px] min-w-[44px] touch-manipulation focus-visible:opacity-100 ${
            side === 'left' ? 'left-0' : 'right-0'
          }`}
          title={isDogEared ? 'Unfold corner bookmark' : 'Fold corner to bookmark'}
        >
          {settings.useColoredRibbons ? (
            <span
              className={`absolute top-0 block w-3 transition-all duration-200 ${
                side === 'left' ? 'left-2.5' : 'right-2.5'
              }`}
              style={{
                height: isDogEared ? '28px' : '8px',
                opacity: isDogEared ? 0.92 : 0,
                backgroundColor: '#A85448',
                clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 78%, 0 100%)',
              }}
            />
          ) : (
            <span
              className={`absolute top-0 block transition-all duration-200 ${
                side === 'left' ? 'left-0' : 'right-0'
              }`}
              style={{
                width: isDogEared ? '26px' : '14px',
                height: isDogEared ? '26px' : '14px',
                opacity: isDogEared ? 1 : 0,
                background:
                  side === 'left'
                    ? `linear-gradient(135deg, ${paper.pageEdgeDark} 48%, ${paper.pageEdge} 50%, ${paper.pageBg} 52%)`
                    : `linear-gradient(225deg, ${paper.pageEdgeDark} 48%, ${paper.pageEdge} 50%, ${paper.pageBg} 52%)`,
                boxShadow: isDogEared ? '0 2px 4px rgba(0,0,0,0.12)' : 'none',
              }}
            />
          )}
          {!isDogEared && (
            <span
              aria-hidden="true"
              className={`absolute top-0 block h-4 w-4 opacity-0 transition-opacity group-hover:opacity-45 ${
                side === 'left' ? 'left-0' : 'right-0'
              }`}
              style={{
                background:
                  side === 'left'
                    ? `linear-gradient(135deg, ${paper.pageEdgeDark} 49%, transparent 51%)`
                    : `linear-gradient(225deg, ${paper.pageEdgeDark} 49%, transparent 51%)`,
              }}
            />
          )}
        </button>
      )}

      {/* Main Page Interior */}
      <div className="relative z-[6] flex h-full w-full flex-col">
        {page.kind === 'front-bookplate' && (
          <BookplatePage
            volume={volume}
            totalVolumesCount={totalVolumesCount}
            paper={paper}
            reducedTexture={settings.reducedTexture}
            onRemoveVolume={onRemoveVolume}
            onEmptyReadingRoom={onEmptyReadingRoom}
            onJumpToToc={onJumpToToc}
          />
        )}

        {page.kind === 'title-page' && (
          <TitlePage volume={volume} paper={paper} handClass={handClass} />
        )}

        {page.kind === 'toc' && (
          <TocPage
            entries={page.tocEntries || []}
            isCollection={volume.isCollection}
            paper={paper}
            handClass={handClass}
            savedChapterIndices={savedChapterIndices}
            onSelectPageNumber={onSelectTocPage}
            onStartReadAloud={onStartReadAloud}
          />
        )}

        {page.kind === 'blank-verso' && (
          <div className="flex h-full w-full items-center justify-center" aria-hidden="true" />
        )}

        {page.kind === 'endpaper' && (
          <FinalEndpaperPage
            volume={volume}
            paper={paper}
            onSaveFinalThought={onSaveFinalThought}
            onCloseBook={onCloseBook}
            onOpenBackCover={onOpenBackCover}
          />
        )}

        {page.kind === 'content' && (
          <article className="flex h-full min-h-0 flex-col" style={spacing.paddingStyle}>
            {/* Notebook Format: compact top header strip with outer page number (tight & practical) */}
            {isNotebook && (
              <header
                className={`mb-2 flex shrink-0 items-baseline justify-between border-b pb-1 font-hand-patrick text-[11px] ${
                  side === 'left' ? 'flex-row-reverse' : 'flex-row'
                }`}
                style={{
                  borderColor: `${paper.ink}18`,
                  color: paper.pencilInk,
                }}
              >
                <button
                  type="button"
                  onClick={onJumpToToc}
                  title="Click to view Table of Contents"
                  className="truncate max-w-[72%] opacity-75 hover:opacity-100 transition-opacity text-left underline decoration-dotted underline-offset-2"
                >
                  {page.sectionTitle || volume.title}
                </button>
                {page.displayNumber !== null && (
                  <span className="shrink-0 tabular-nums opacity-85">
                    p. {page.displayNumber}
                  </span>
                )}
              </header>
            )}

            <div className="flex-1 min-h-0 overflow-visible pr-0.5">
              {(page.blocks || []).map(renderBlockContent)}
            </div>

            {/* Novel Format: quiet faint pencil page number and clickable section header at bottom */}
            {!isNotebook && (
              <footer
                className={`mt-1.5 flex shrink-0 items-baseline justify-between font-hand-patrick text-[12px] tabular-nums opacity-65 ${
                  side === 'left' ? 'flex-row-reverse' : 'flex-row'
                }`}
                style={{ color: paper.pencilInk }}
              >
                <button
                  type="button"
                  onClick={onJumpToToc}
                  title="Click to view Table of Contents"
                  className="truncate max-w-[75%] hover:opacity-100 transition-opacity text-left underline decoration-dotted underline-offset-2"
                >
                  {page.sectionTitle || volume.title}
                </button>
                {page.displayNumber !== null && (
                  <span className="shrink-0">
                    {page.displayNumber}
                  </span>
                )}
              </footer>
            )}
          </article>
        )}
      </div>
    </section>
  );
}
