import { useState } from 'react';
import { estimateVolumeBytes, exportVolumeAsMarkdown, formatBytes } from '../lib/storage';
import { formatShortDate } from '../lib/parser';
import { ColophonMark, getEndpaperBackgroundStyle } from './BookOrnaments';
import type { BookVolume, TocEntry } from '../types/book';
import { getPaperSpec, type PaperSpec } from '../lib/lighting';

interface BookplatePageProps {
  volume: BookVolume;
  totalVolumesCount: number;
  paper?: PaperSpec;
  reducedTexture: boolean;
  onRemoveVolume: (id: string) => void;
  onEmptyReadingRoom: () => void;
  onJumpToToc: () => void;
}

export function BookplatePage({
  volume,
  totalVolumesCount,
  paper: rawPaper,
  reducedTexture,
  onRemoveVolume,
  onEmptyReadingRoom,
  onJumpToToc,
}: BookplatePageProps) {
  const paper = rawPaper && rawPaper.pageBg ? rawPaper : getPaperSpec(rawPaper?.id);
  const [expanded, setExpanded] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  const bytesUsed = estimateVolumeBytes(volume);

  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center p-6 sm:p-10"
      style={{
        backgroundColor: paper.isDarkPaper ? '#1D1D1F' : '#ECE6DA',
        ...getEndpaperBackgroundStyle(
          volume.identity.endpaperPattern,
          volume.identity.coverColor,
          reducedTexture
        ),
      }}
    >
      <div
        className="relative w-full max-w-[300px] rounded-[2px] border px-6 py-7 text-center shadow-sm transition-all"
        style={{
          backgroundColor: paper.pageBg,
          borderColor: `${paper.ink}28`,
          color: paper.ink,
        }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-1.5 border"
          style={{ borderColor: `${paper.ink}18` }}
        />

        <div className="mb-3 flex justify-center opacity-70">
          <ColophonMark symbol={volume.identity.symbol} color={paper.ink} size={20} />
        </div>

        <p className="font-hand-kalam text-base font-normal leading-snug">
          Bound in this browser
        </p>
        <p className="mt-1 font-hand-patrick text-xs" style={{ color: paper.mutedInk }}>
          This volume has never left your device.
        </p>

        <div
          className="my-4 h-px w-16 mx-auto"
          style={{ backgroundColor: `${paper.ink}20` }}
        />

        <p className="font-hand-patrick text-xs leading-relaxed" style={{ color: paper.mutedInk }}>
          <strong className="font-normal" style={{ color: paper.ink }}>
            This book belongs only here.
          </strong>{' '}
          Its pages, notes, and reading place are stored in this browser. Nothing has been
          uploaded.
        </p>

        <button
          type="button"
          onClick={() => {
            setExpanded((prev) => !prev);
            setConfirmRemove(false);
            setConfirmEmpty(false);
          }}
          aria-expanded={expanded}
          className="mt-4 font-hand-kalam text-xs underline decoration-dotted underline-offset-4 transition-opacity hover:opacity-75"
          style={{ color: paper.pencilInk }}
        >
          {expanded ? 'Fold provenance note' : 'Inspect binding & storage'}
        </button>

        {expanded && (
          <div
            className="mt-4 space-y-2.5 border-t pt-3.5 text-left font-hand-patrick text-xs"
            style={{ borderColor: `${paper.ink}18`, color: paper.mutedInk }}
          >
            <div className="flex justify-between gap-2">
              <span>Local storage</span>
              <span className="font-book-mono text-[11px] tabular-nums" style={{ color: paper.ink }}>
                {formatBytes(bytesUsed)}
              </span>
            </div>
            <div>
              <span className="block opacity-80">Source files</span>
              <ul className="mt-0.5 space-y-0.5" style={{ color: paper.ink }}>
                {volume.sourceFiles.slice(0, 3).map((f) => (
                  <li key={f.name} className="truncate font-hand-kalam text-[12px]">
                    {f.name}
                  </li>
                ))}
                {volume.sourceFiles.length > 3 && (
                  <li className="text-[11px] opacity-75">
                    +{volume.sourceFiles.length - 3} more files
                  </li>
                )}
              </ul>
            </div>

            {volume.ocrNote && (
              <p className="rounded-[2px] border border-dashed px-2 py-1.5 text-[11px] italic">
                {volume.ocrNote}
              </p>
            )}

            <div className="flex flex-wrap gap-x-4 gap-y-2 pt-2">
              <button
                type="button"
                onClick={() => exportVolumeAsMarkdown(volume)}
                className="underline decoration-dotted underline-offset-4 hover:opacity-75"
                style={{ color: paper.ink }}
              >
                Export book
              </button>

              {!confirmRemove ? (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmRemove(true);
                    setConfirmEmpty(false);
                  }}
                  className="underline decoration-dotted underline-offset-4 hover:opacity-75"
                  style={{ color: '#8E4139' }}
                >
                  Remove book
                </button>
              ) : (
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onRemoveVolume(volume.id)}
                    className="font-semibold underline underline-offset-2"
                    style={{ color: '#8E4139' }}
                  >
                    Confirm remove
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(false)}
                    className="opacity-70"
                  >
                    cancel
                  </button>
                </span>
              )}
            </div>

            {totalVolumesCount > 0 && (
              <div className="border-t pt-2.5" style={{ borderColor: `${paper.ink}14` }}>
                {!confirmEmpty ? (
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmEmpty(true);
                      setConfirmRemove(false);
                    }}
                    className="text-[11px] underline decoration-dotted underline-offset-4 opacity-80 hover:opacity-100"
                    style={{ color: '#8E4139' }}
                  >
                    Empty this reading room
                  </button>
                ) : (
                  <div className="space-y-1.5">
                    <p className="text-[11px]" style={{ color: '#8E4139' }}>
                      Remove all {totalVolumesCount} bound volumes and notes from this browser?
                    </p>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={onEmptyReadingRoom}
                        className="font-semibold underline underline-offset-2"
                        style={{ color: '#8E4139' }}
                      >
                        Yes, clear all
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmEmpty(false)}
                        className="opacity-75"
                      >
                        Keep books
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onJumpToToc}
        className="mt-5 font-hand-kalam text-xs underline decoration-dotted underline-offset-4 opacity-70 hover:opacity-100"
        style={{ color: paper.ink }}
      >
        Turn to contents
      </button>
    </div>
  );
}

interface TitlePageProps {
  volume: BookVolume;
  paper?: PaperSpec;
  handClass: string;
}

export function TitlePage({ volume, paper: rawPaper, handClass }: TitlePageProps) {
  const paper = rawPaper && rawPaper.pageBg ? rawPaper : getPaperSpec(rawPaper?.id);
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-between px-8 py-12 sm:px-12 sm:py-16 text-center"
      style={{ color: paper.ink }}
    >
      <div className="pt-2 opacity-60">
        <ColophonMark symbol={volume.identity.symbol} color={paper.ink} size={22} />
      </div>

      <div className="max-w-xs space-y-4">
        <h1 className={`${handClass} text-[28px] sm:text-[32px] leading-snug [text-wrap:balance]`}>
          {volume.title}
        </h1>
        {volume.author && (
          <p className="font-hand-patrick text-base" style={{ color: paper.mutedInk }}>
            {volume.author}
          </p>
        )}
        {volume.isCollection && (
          <p className="font-hand-patrick text-xs italic" style={{ color: paper.pencilInk }}>
            Collected from {volume.sourceFiles.length} local documents
          </p>
        )}
      </div>

      <div className="space-y-1 font-hand-patrick text-xs" style={{ color: paper.pencilInk }}>
        <p>Bound {formatShortDate(volume.createdAt)}</p>
        <p className="opacity-70">{volume.sections.length} {volume.sections.length === 1 ? 'section' : 'sections'}</p>
      </div>
    </div>
  );
}

interface TocPageProps {
  entries: TocEntry[];
  isCollection: boolean;
  paper?: PaperSpec;
  handClass: string;
  onSelectPageNumber: (pageNumber: number) => void;
  onStartReadAloud?: (pageNumber: number) => void;
}

export function TocPage({
  entries,
  isCollection,
  paper: rawPaper,
  handClass,
  onSelectPageNumber,
  onStartReadAloud,
}: TocPageProps) {
  const paper = rawPaper && rawPaper.pageBg ? rawPaper : getPaperSpec(rawPaper?.id);
  const [filterQuery, setFilterQuery] = useState('');

  const filtered = filterQuery.trim()
    ? entries.filter(
        (e) =>
          e.title.toLowerCase().includes(filterQuery.toLowerCase()) ||
          (e.sourceFile && e.sourceFile.toLowerCase().includes(filterQuery.toLowerCase())) ||
          String(e.pageNumber).includes(filterQuery)
      )
    : entries;

  return (
    <div
      className="flex h-full w-full flex-col px-6 py-8 sm:px-10 sm:py-10"
      style={{ color: paper.ink }}
    >
      <div className="pb-2 border-b" style={{ borderColor: `${paper.ink}18` }}>
        <div className="flex items-baseline justify-between">
          <h2 className={`${handClass} text-xl sm:text-2xl`}>
            Contents
          </h2>
          <span
            className="font-hand-patrick text-xs tracking-wider opacity-60 tabular-nums"
            style={{ color: paper.pencilInk }}
          >
            {entries.length} chapters
          </span>
        </div>

        {entries.length > 12 && (
          <div className="mt-2.5">
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Find chapter or number..."
              className="w-full rounded-[3px] border bg-transparent px-2.5 py-1 font-hand-patrick text-xs outline-none transition-colors"
              style={{
                borderColor: `${paper.ink}24`,
                color: paper.ink,
              }}
            />
          </div>
        )}
      </div>

      <nav
        aria-label="Table of contents"
        data-inner-scroll="true"
        className="quiet-scroll mt-3 flex-1 overflow-y-auto pr-1"
      >
        {filtered.length === 0 ? (
          <p className="mt-6 text-center font-hand-patrick text-xs opacity-60">
            No chapters match &ldquo;{filterQuery}&rdquo;
          </p>
        ) : (
          <ol className="space-y-3">
            {filtered.map((entry) => (
              <li key={`${entry.sectionIndex}-${entry.title}`} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSelectPageNumber(entry.pageNumber)}
                  className="group flex flex-1 items-baseline justify-between gap-3 text-left transition-opacity hover:opacity-70 cursor-pointer min-w-0"
                >
                  <span className={`${handClass} text-[15px] sm:text-[16px] leading-snug truncate`}>
                    {entry.title}
                  </span>
                  <span
                    aria-hidden="true"
                    className="flex-1 border-b border-dotted shrink-0 min-w-[20px]"
                    style={{ borderColor: `${paper.ink}25` }}
                  />
                  <span
                    className="shrink-0 font-hand-patrick text-xs tabular-nums"
                    style={{ color: paper.pencilInk }}
                  >
                    {entry.pageNumber}
                  </span>
                </button>
                {onStartReadAloud && (
                  <button
                    type="button"
                    onClick={() => onStartReadAloud(entry.pageNumber)}
                    title={`Read "${entry.title}" aloud`}
                    aria-label={`Read "${entry.title}" aloud`}
                    className="flex min-h-[32px] min-w-[32px] items-center justify-center rounded p-1 text-xs opacity-40 hover:opacity-100 hover:bg-black/5 transition-all cursor-pointer touch-manipulation shrink-0"
                    style={{ color: paper.pencilInk }}
                  >
                    🔊
                  </button>
                )}
                {isCollection && entry.sourceFile && (
                  <span
                    className="block pl-1 font-hand-patrick text-[11px] opacity-65"
                    style={{ color: paper.pencilInk }}
                  >
                    {entry.sourceFile}
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </nav>
    </div>
  );
}
