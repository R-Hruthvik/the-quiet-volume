import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getFolderNameFromFiles } from '../lib/fileImporter';
import { computeDesktopTableLayout, getPhysicalBookMetrics } from '../lib/dimensions';
import { getCoverMaterialClass } from '../lib/identity';
import { getLightingSpec } from '../lib/lighting';
import { formatShortDate } from '../lib/parser';
import { ColophonMark } from './BookOrnaments';
import type { BookSizeId, BookVolume, LightingMode } from '../types/book';

export interface PendingCollectionPrompt {
  fileNames: string[];
  onBindTogether: () => void;
  onKeepSeparate: () => void;
  onCancel: () => void;
}

interface ClosedTableViewProps {
  volumes: BookVolume[];
  activeBookId: string | null;
  hasOpenedAnyBook: boolean;
  bookSize: BookSizeId;
  cameraTilt: number;
  lighting: LightingMode;
  reducedTexture: boolean;
  isDraggingFiles: boolean;
  pendingPrompt: PendingCollectionPrompt | null;
  onSelectFiles: (files: File[], folderName?: string) => void;
  onBindSampleManuscript: () => void;
  onOpenVolume: (volumeId: string) => void;
  onOpenSettingsBook: () => void;
}

export function ClosedTableView({
  volumes,
  activeBookId,
  hasOpenedAnyBook,
  bookSize,
  cameraTilt,
  lighting,
  reducedTexture,
  isDraggingFiles,
  pendingPrompt,
  onSelectFiles,
  onBindSampleManuscript,
  onOpenVolume,
  onOpenSettingsBook,
}: ClosedTableViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const multiFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute('webkitdirectory', '');
      folderInputRef.current.setAttribute('directory', '');
      (folderInputRef.current as any).webkitdirectory = true;
      (folderInputRef.current as any).directory = true;
    }
  }, []);

  const [viewport, setViewport] = useState({
    w: typeof window !== 'undefined' ? window.innerWidth : 1440,
    h: typeof window !== 'undefined' ? window.innerHeight : 900,
  });
  const [stackSpread, setStackSpread] = useState(false);
  const [rightPairHovered, setRightPairHovered] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogFilter, setCatalogFilter] = useState('');

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const lightSpec = getLightingSpec(lighting);
  const metrics = useMemo(() => getPhysicalBookMetrics(bookSize), [bookSize]);
  const layout = useMemo(
    () => computeDesktopTableLayout(metrics, viewport.w, viewport.h),
    [metrics, viewport.w, viewport.h]
  );

  const tableTilt = reducedTexture ? 0 : Math.min(12, Math.round(cameraTilt * 0.8));

  const activeVolume = useMemo(
    () => volumes.find((v) => v.id === activeBookId) || null,
    [volumes, activeBookId]
  );

  const centerBook = hasOpenedAnyBook && activeVolume ? activeVolume : null;

  const sideStackVolumes = useMemo(() => {
    const others = centerBook ? volumes.filter((v) => v.id !== centerBook.id) : volumes;
    return others.slice(0, 3);
  }, [volumes, centerBook]);

  const filteredCatalog = useMemo(() => {
    const q = catalogFilter.trim().toLowerCase();
    if (!q) return volumes;
    return volumes.filter(
      (v) =>
        v.title.toLowerCase().includes(q) ||
        (v.author && v.author.toLowerCase().includes(q))
    );
  }, [volumes, catalogFilter]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length > 0) {
      onSelectFiles(selected);
    }
    e.target.value = '';
  };

  const handleMultiFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length > 0) {
      // User pressed Ctrl+A or selected multiple files: bind directly as chapters!
      onSelectFiles(selected, 'Selected Chapters');
    }
    e.target.value = '';
  };

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length > 0) {
      const folderName = getFolderNameFromFiles(selected) || 'Imported Book';
      onSelectFiles(selected, folderName);
    }
    e.target.value = '';
  };

  const triggerFilePicker = () => {
    fileInputRef.current?.click();
  };

  const triggerMultiFilePicker = () => {
    multiFileInputRef.current?.click();
  };

  const triggerFolderPicker = async () => {
    // 1. First try modern Directory Picker (Chrome/Edge on Linux/Windows/Mac)
    if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
      try {
        const dirHandle = await (window as any).showDirectoryPicker();
        const collectedFiles: File[] = [];

        async function readDir(handle: any, prefix = '') {
          for await (const entry of handle.values()) {
            if (entry.kind === 'file') {
              const lower = entry.name.toLowerCase();
              if (lower.startsWith('.') || lower.startsWith('__macosx')) continue;
              if (
                lower.endsWith('.txt') ||
                lower.endsWith('.md') ||
                lower.endsWith('.markdown') ||
                lower.endsWith('.text') ||
                lower.endsWith('.epub') ||
                lower.endsWith('.pdf')
              ) {
                const file = await entry.getFile();
                if (file.size > 25) {
                  Object.defineProperty(file, 'webkitRelativePath', {
                    value: prefix ? `${prefix}/${file.name}` : `${handle.name}/${file.name}`,
                    writable: true,
                  });
                  collectedFiles.push(file);
                }
              }
            } else if (entry.kind === 'directory') {
              if (!entry.name.startsWith('.')) {
                await readDir(
                  entry,
                  prefix ? `${prefix}/${entry.name}` : `${handle.name}/${entry.name}`
                );
              }
            }
          }
        }

        await readDir(dirHandle);
        if (collectedFiles.length > 0) {
          onSelectFiles(collectedFiles, dirHandle.name);
          return;
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return; // User closed picker
      }
    }

    // 2. Fallback to HTML input with webkitdirectory
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute('webkitdirectory', '');
      folderInputRef.current.setAttribute('directory', '');
      (folderInputRef.current as any).webkitdirectory = true;
      (folderInputRef.current as any).directory = true;
      folderInputRef.current.click();
    }
  };

  const bookThicknessPx = (vol: BookVolume) => {
    const blocks = vol.blocks.length;
    return Math.max(10, Math.min(22, Math.round(9 + blocks * 0.42)));
  };

  const wearRadius = (vol: BookVolume) => {
    return Math.min(10, 5 + Math.floor(vol.wearCount / 2));
  };

  // Scale typography harmoniously on zoomed PC/laptop viewports without distorting book ratios
  const compactScale = layout.isDesktop && layout.uniformScale < 0.56;

  return (
    <div
      className="relative flex h-full w-full items-center justify-center px-4 sm:px-6"
      data-testid="closed-table-stage"
      data-desktop-layout={layout.isDesktop ? 'true' : 'false'}
      style={{
        transform: tableTilt ? `perspective(2200px) rotateX(${tableTilt}deg)` : undefined,
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".txt,.md,.markdown,.pdf,.epub,.zip,text/plain,text/markdown,application/pdf,application/epub+zip,application/zip"
        onChange={handleFileChange}
        className="sr-only"
        aria-label="Choose local files to bind into a book"
      />
      <input
        ref={multiFileInputRef}
        type="file"
        multiple
        accept=".txt,.md,.markdown,.pdf,.epub,.zip,text/plain,text/markdown,application/pdf,application/epub+zip,application/zip"
        onChange={handleMultiFileChange}
        className="sr-only"
        aria-label={
          viewport.w < 640
            ? 'Select multiple files to bind into a book'
            : 'Select multiple files (Ctrl+A) to bind into a book'
        }
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        onChange={handleFolderChange}
        className="sr-only"
        aria-label="Choose a folder of text files to bind into a book"
      />

      {/* PROPORTIONAL 3-ZONE DESK COMPOSITION ON PC & LAPTOP (>= 768px)
          Ensures uniform aspect ratio and keeps all resting volumes + Settings Book visible even under browser zoom! */}
      <div
        className="flex items-center justify-center"
        style={{
          gap: layout.isDesktop ? `${layout.columnGap}px` : undefined,
        }}
      >
        {/* LEFT DESK ZONE: Stacked resting volumes (always visible on PC/laptop >= 768px) */}
        {layout.isDesktop && (
          <aside
            aria-label="Resting book stack"
            data-testid="resting-book-stack"
            className="flex shrink-0 flex-col items-start justify-center"
            style={{ width: `${layout.sideW + layout.stackOffsetX * 2 + 12}px` }}
            onMouseEnter={() => setStackSpread(true)}
            onMouseLeave={() => setStackSpread(false)}
          >
            {sideStackVolumes.length > 0 ? (
              <>
                <div
                  className="relative"
                  style={{
                    height: `${layout.sideH + layout.stackOffsetY * Math.max(1, sideStackVolumes.length - 1) + 28}px`,
                    width: `${layout.sideW + layout.stackOffsetX * Math.max(1, sideStackVolumes.length - 1) + 8}px`,
                  }}
                >
                  {[...sideStackVolumes].reverse().map((vol, idx, arr) => {
                    const isTop = idx === arr.length - 1;
                    const spreadX = stackSpread
                      ? idx * Math.round(layout.stackOffsetX * 1.45)
                      : idx * layout.stackOffsetX;
                    const spreadY = stackSpread
                      ? idx * Math.round(layout.stackOffsetY * 1.25) - 6
                      : idx * layout.stackOffsetY;
                    const angle = stackSpread ? -5.5 + idx * 4.5 : -5 + idx * 3.8;
                    const thickness = bookThicknessPx(vol);
                    return (
                      <button
                        key={vol.id}
                        type="button"
                        onClick={() => onOpenVolume(vol.id)}
                        onFocus={() => setStackSpread(true)}
                        aria-label={`Open ${vol.title}${vol.author ? ` by ${vol.author}` : ''}`}
                        className={`group absolute left-0 top-2 text-left transition-all duration-300 ease-out hover:-translate-y-2 focus-visible:-translate-y-2 ${
                          !reducedTexture ? getCoverMaterialClass(vol.identity.coverMaterial) : ''
                        } ${isTop ? 'z-20' : ''}`}
                        style={{
                          width: `${layout.sideW}px`,
                          height: `${layout.sideH}px`,
                          backgroundColor: vol.identity.coverColor,
                          borderRadius: `2px ${wearRadius(vol)}px ${wearRadius(vol)}px 2px`,
                          transform: `translate(${spreadX}px, ${spreadY}px) rotate(${angle}deg)`,
                          zIndex: 10 + idx,
                          boxShadow: `${thickness * 0.45}px ${thickness * 0.85}px 24px rgba(10, 8, 6, 0.36), inset -4px 0 0 rgba(244, 239, 229, 0.88), inset -7px 0 0 rgba(206, 198, 182, 0.78), 0 6px 0 -2px rgba(235, 229, 216, 0.85)`,
                        }}
                      >
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-0 left-0 w-4 rounded-l-[2px]"
                          style={{
                            backgroundColor: vol.identity.spineColor,
                            boxShadow: 'inset -2px 0 5px rgba(0,0,0,0.22)',
                          }}
                        />
                        <span
                          aria-hidden="true"
                          className="absolute -bottom-3 right-6 h-3.5 w-2 rounded-b-[1px] shadow-sm"
                          style={{
                            backgroundColor: vol.identity.ribbonColor,
                            clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 76%, 0 100%)',
                          }}
                        />
                        <div className="relative flex h-full flex-col justify-between p-3 pl-6">
                          <div className="opacity-70">
                            <ColophonMark
                              symbol={vol.identity.symbol}
                              color={vol.identity.inkOnCover}
                              size={compactScale ? 12 : 14}
                            />
                          </div>
                          <div
                            className="rounded-[2px] px-2.5 py-1.5"
                            style={
                              vol.identity.titleTreatment === 'paper-label'
                                ? {
                                    backgroundColor: '#F3EDE1',
                                    color: '#26201B',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                                  }
                                : { color: vol.identity.inkOnCover }
                            }
                          >
                            <span
                              className={`block font-hand-kalam leading-snug line-clamp-3 ${
                                compactScale ? 'text-[12px]' : 'text-[14px]'
                              }`}
                            >
                              {vol.title}
                            </span>
                            {vol.author && !compactScale && (
                              <span className="mt-0.5 block font-hand-patrick text-[10.5px] opacity-70 truncate">
                                {vol.author}
                              </span>
                            )}
                          </div>
                          <div className="h-0.5" />
                        </div>
                      </button>
                    );
                  })}
                </div>

                {volumes.length >= 3 && (
                  <button
                    type="button"
                    onClick={() => setCatalogOpen((prev) => !prev)}
                    aria-label="Open handwritten library catalog notebook"
                    className="mt-4 flex items-center gap-2 rounded-r-[4px] rounded-l-[2px] border border-[#3B332B]/40 bg-[#E9E2D4] px-3 py-1.5 text-left text-[#2B251F] shadow-md transition-transform duration-200 hover:-translate-y-0.5"
                  >
                    <span className="h-4 w-1.5 rounded-sm bg-[#6E543E]" aria-hidden="true" />
                    <span className="font-hand-kalam text-xs">
                      Index of {volumes.length} volumes
                    </span>
                  </button>
                )}
              </>
            ) : (
              <div aria-hidden="true" />
            )}
          </aside>
        )}

        {/* CENTER DESK ZONE: Strictly aspect-ratio-locked primary book */}
        <div className="relative flex shrink-0 flex-col items-center max-w-full">
          {centerBook ? (
            <div className="relative flex flex-col items-center">
              <button
                type="button"
                onClick={() => onOpenVolume(centerBook.id)}
                aria-label={`Open ${centerBook.title} to your ribbon`}
                data-testid="active-closed-book"
                className={`group relative text-left transition-transform duration-300 ease-out hover:-translate-y-1.5 ${
                  !reducedTexture ? getCoverMaterialClass(centerBook.identity.coverMaterial) : ''
                }`}
                style={{
                  width: `${layout.centerW}px`,
                  height: `${layout.centerH}px`,
                  backgroundColor: centerBook.identity.coverColor,
                  borderRadius: `3px ${wearRadius(centerBook)}px ${wearRadius(centerBook)}px 3px`,
                  boxShadow: `${lightSpec.bookShadow}, inset -7px 0 0 rgba(246, 241, 232, 0.9), inset -10px 0 0 rgba(209, 200, 184, 0.78), 0 8px 0 -2px rgba(235, 229, 216, 0.88), 0 11px 0 -2px ${centerBook.identity.spineColor}`,
                }}
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 w-7 rounded-l-[3px]"
                  style={{
                    backgroundColor: centerBook.identity.spineColor,
                    boxShadow:
                      'inset -3px 0 8px rgba(0, 0, 0, 0.28), 2px 0 0 rgba(255, 255, 255, 0.06)',
                  }}
                />

                <span aria-hidden="true" className="absolute inset-y-2 left-8 w-px bg-black/20" />

                {centerBook.dogEaredPages.slice(0, 4).map((pIdx, i) => (
                  <span
                    key={pIdx}
                    aria-hidden="true"
                    className="absolute right-0 h-2.5 w-1.5 rounded-l-[1px] bg-[#D9C7A7]"
                    style={{ top: `${Math.round(layout.centerH * 0.16) + i * 24}px` }}
                  />
                ))}

                <span
                  aria-hidden="true"
                  className="absolute -bottom-7 right-12 h-8 w-3.5 shadow-md transition-transform duration-300 group-hover:translate-y-0.5"
                  style={{
                    backgroundColor: centerBook.identity.ribbonColor,
                    clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 78%, 0 100%)',
                  }}
                />

                <div
                  className={`relative flex h-full flex-col items-center justify-between text-center ${
                    compactScale ? 'px-6 py-7 pl-11' : 'px-9 py-10 pl-14'
                  }`}
                >
                  <div className="opacity-75">
                    <ColophonMark
                      symbol={centerBook.identity.symbol}
                      color={centerBook.identity.inkOnCover}
                      size={compactScale ? 18 : 22}
                    />
                  </div>

                  <div
                    className={`w-full rounded-[2px] ${compactScale ? 'px-3.5 py-4' : 'px-5 py-5'}`}
                    style={
                      centerBook.identity.titleTreatment === 'paper-label'
                        ? {
                            backgroundColor: '#F4EFE4',
                            color: '#241F1A',
                            boxShadow:
                              '0 2px 6px rgba(0,0,0,0.22), inset 0 0 0 1px rgba(40,32,22,0.08)',
                          }
                        : centerBook.identity.titleTreatment === 'embossed'
                        ? {
                            color: centerBook.identity.inkOnCover,
                            border: `1px solid ${centerBook.identity.inkOnCover}35`,
                          }
                        : {
                            color: centerBook.identity.inkOnCover,
                          }
                    }
                  >
                    <h1
                      className={`font-hand-kalam leading-snug [text-wrap:balance] ${
                        compactScale ? 'text-[19px]' : 'text-[24px] sm:text-[26px]'
                      }`}
                    >
                      {centerBook.title}
                    </h1>
                    {centerBook.author && (
                      <p className="mt-1.5 font-hand-patrick text-xs sm:text-sm opacity-75">
                        {centerBook.author}
                      </p>
                    )}
                  </div>

                  <div
                    className="font-hand-patrick text-[11px] tracking-wide opacity-55"
                    style={{ color: centerBook.identity.inkOnCover }}
                  >
                    {centerBook.finishedAt
                      ? `Finished ${formatShortDate(centerBook.finishedAt)}`
                      : centerBook.isCollection
                      ? `${centerBook.sourceFiles.length} bound documents`
                      : ''}
                  </div>
                </div>
              </button>
            </div>
          ) : (
            <div className="relative flex w-full max-w-[94vw] sm:max-w-2xl flex-col items-center px-2">
              <button
                type="button"
                onClick={triggerFilePicker}
                aria-label="Place a file here to bind it into a book (TXT, MD, PDF, EPUB, ZIP)"
                data-testid="unbound-notebook"
                className={`group relative text-center transition-all duration-300 ease-out hover:-translate-y-1 ${
                  !reducedTexture ? 'texture-cover-linen' : ''
                } ${isDraggingFiles ? 'scale-[1.02] ring-2 ring-[#F2EAD8]/70' : ''}`}
                style={{
                  width: `${layout.centerW}px`,
                  height: `${layout.centerH}px`,
                  backgroundColor: '#CFC5B3',
                  borderRadius: '3px 7px 7px 3px',
                  boxShadow: `${lightSpec.bookShadow}, inset -7px 0 0 rgba(247, 243, 234, 0.9), inset -10px 0 0 rgba(212, 203, 187, 0.78), 0 8px 0 -2px rgba(240, 234, 222, 0.9), 0 11px 0 -2px #B6AA95`,
                }}
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 w-7 rounded-l-[3px] bg-[#B6AA95]"
                  style={{ boxShadow: 'inset -3px 0 6px rgba(0, 0, 0, 0.14)' }}
                />
                <span
                  aria-hidden="true"
                  className="absolute inset-y-3 left-8 w-px bg-[#6B5F4D]/25"
                />
                <span
                  aria-hidden="true"
                  className="absolute -bottom-5 right-14 h-5 w-2 rounded-b-sm bg-[#8C7A63] opacity-75"
                />

                <div
                  className={`relative flex h-full flex-col items-center justify-center ${
                    compactScale ? 'px-6 pl-11' : 'px-9 pl-14'
                  }`}
                >
                  <div
                    className={`w-full rounded-[2px] border border-[#6C5F4E]/20 bg-[#F4EFE4]/84 shadow-xs transition-colors group-hover:bg-[#F7F3EA]/95 ${
                      compactScale ? 'px-4 py-5' : 'px-6 py-7'
                    }`}
                  >
                    <h1
                      className={`font-hand-kalam leading-snug text-[#2D261F] [text-wrap:balance] ${
                        compactScale ? 'text-[19px]' : 'text-[23px] sm:text-[26px]'
                      }`}
                    >
                      Place something here to bind it.
                    </h1>
                    <p className="mt-4 font-hand-patrick text-[11px] tracking-[0.16em] text-[#6B5F52]">
                      TXT · MD · PDF · EPUB · ZIP · FOLDER
                    </p>
                  </div>
                </div>
              </button>

              <div className="mt-7 flex w-full max-w-[94vw] sm:max-w-2xl flex-wrap items-center justify-center gap-2 sm:gap-x-5 sm:gap-y-2 px-2">
                <button
                  type="button"
                  onClick={triggerFolderPicker}
                  className="inline-flex min-h-[44px] items-center justify-center px-3 py-2.5 font-hand-kalam text-sm tracking-wide opacity-80 underline decoration-dotted underline-offset-4 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7B5D3B]/60 rounded-xs"
                  style={{ color: lightSpec.tableInk }}
                >
                  Import folder as chapters
                </button>
                <span aria-hidden="true" className="hidden sm:inline" style={{ color: lightSpec.tableInk, opacity: 0.4 }}>
                  ·
                </span>
                <button
                  type="button"
                  onClick={triggerMultiFilePicker}
                  className="inline-flex min-h-[44px] items-center justify-center px-3 py-2.5 font-hand-kalam text-sm tracking-wide opacity-80 underline decoration-dotted underline-offset-4 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7B5D3B]/60 rounded-xs"
                  style={{ color: lightSpec.tableInk }}
                >
                  {viewport.w < 640 ? 'Select multiple files' : 'Select multiple files (Ctrl+A)'}
                </button>
                <span aria-hidden="true" className="hidden sm:inline" style={{ color: lightSpec.tableInk, opacity: 0.4 }}>
                  ·
                </span>
                <button
                  type="button"
                  onClick={onBindSampleManuscript}
                  className="inline-flex min-h-[44px] items-center justify-center px-3 py-2.5 font-hand-kalam text-sm tracking-wide opacity-80 underline decoration-dotted underline-offset-4 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7B5D3B]/60 rounded-xs"
                  style={{ color: lightSpec.tableInk }}
                >
                  Or bind a sample manuscript
                </button>
                {!layout.isDesktop && volumes[0] && (
                  <>
                    <span aria-hidden="true" className="hidden sm:inline" style={{ color: lightSpec.tableInk, opacity: 0.4 }}>
                      ·
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenVolume(volumes[0].id)}
                      className="inline-flex min-h-[44px] items-center justify-center px-3 py-2.5 font-hand-kalam text-sm tracking-wide opacity-80 underline decoration-dotted underline-offset-4 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7B5D3B]/60 rounded-xs"
                      style={{ color: lightSpec.tableInk }}
                    >
                      Open “{volumes[0].title}”
                    </button>
                  </>
                )}
                {!layout.isDesktop && (
                  <>
                    <span aria-hidden="true" className="hidden sm:inline" style={{ color: lightSpec.tableInk, opacity: 0.4 }}>
                      ·
                    </span>
                    <button
                      type="button"
                      onClick={onOpenSettingsBook}
                      className="inline-flex min-h-[44px] items-center justify-center px-3 py-2.5 font-hand-kalam text-sm tracking-wide opacity-80 underline decoration-dotted underline-offset-4 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7B5D3B]/60 rounded-xs"
                      style={{ color: lightSpec.tableInk }}
                    >
                      Settings book
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT DESK ZONE: Separate Physical Settings Book + Unbound Notebook (always visible on PC/laptop >= 768px) */}
        {layout.isDesktop && (
          <aside
            aria-label="Settings handbook and unbound notebook"
            data-testid="right-desk-books"
            className="flex shrink-0 flex-col items-end justify-center"
            style={{ width: `${layout.settingsW + 34}px` }}
            onMouseEnter={() => setRightPairHovered(true)}
            onMouseLeave={() => setRightPairHovered(false)}
          >
            <div
              className="relative"
              style={{
                width: `${layout.settingsW + (centerBook ? 28 : 8)}px`,
                height: `${layout.settingsH + (centerBook ? 46 : 12)}px`,
              }}
            >
              {/* When a bound book is center-stage, tuck the unbound linen notebook slightly behind the Settings Book */}
              {centerBook && (
                <button
                  type="button"
                  onClick={triggerFilePicker}
                  aria-label="Place something here to bind a new book"
                  data-testid="desk-bind-notebook"
                  className={`group absolute right-0 top-0 text-center transition-all duration-300 ease-out hover:-translate-y-2 hover:z-30 ${
                    !reducedTexture ? 'texture-cover-linen' : ''
                  }`}
                  style={{
                    width: `${layout.sideW}px`,
                    height: `${layout.sideH}px`,
                    backgroundColor: '#CFC5B3',
                    borderRadius: '2px 6px 6px 2px',
                    transform: rightPairHovered
                      ? 'translate(10px, -10px) rotate(5deg)'
                      : 'translate(6px, -4px) rotate(4deg)',
                    zIndex: 10,
                    boxShadow:
                      '8px 16px 28px rgba(10, 8, 6, 0.3), inset -4px 0 0 rgba(246, 242, 232, 0.88), 0 6px 0 -2px rgba(235, 229, 216, 0.85)',
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 w-4 rounded-l-[2px] bg-[#B6AA95]"
                  />
                  <div className="flex h-full flex-col items-center justify-start px-3 pt-4 pl-6">
                    <span
                      className={`font-hand-kalam leading-snug text-[#2E2720] ${
                        compactScale ? 'text-[11px]' : 'text-[12.5px]'
                      }`}
                    >
                      Bind a new file…
                    </span>
                    <span className="mt-1 font-hand-patrick text-[9px] tracking-[0.12em] text-[#6B5F52]">
                      TXT · MD · PDF · EPUB
                    </span>
                  </div>
                </button>
              )}

              {/* THE SEPARATE PHYSICAL SETTINGS BOOK resting right on the desk */}
              <button
                type="button"
                onClick={onOpenSettingsBook}
                aria-label="Open Settings and Book Craft handbook (shortcut S)"
                data-testid="settings-closed-book"
                className={`group absolute left-0 text-left transition-all duration-300 ease-out hover:-translate-y-2 focus-visible:-translate-y-2 ${
                  !reducedTexture ? 'texture-cover-leather' : ''
                }`}
                style={{
                  top: centerBook ? '42px' : '4px',
                  width: `${layout.settingsW}px`,
                  height: `${layout.settingsH}px`,
                  backgroundColor: '#5A4336',
                  borderRadius: '2px 7px 7px 2px',
                  transform: centerBook
                    ? rightPairHovered
                      ? 'translate(-6px, 6px) rotate(-1.5deg)'
                      : 'rotate(-2deg)'
                    : 'rotate(2.4deg)',
                  zIndex: 20,
                  boxShadow:
                    '10px 18px 34px rgba(10, 8, 6, 0.4), inset -5px 0 0 rgba(244, 239, 229, 0.88), inset -8px 0 0 rgba(206, 198, 182, 0.78), 0 6px 0 -2px rgba(235, 229, 216, 0.86), 0 9px 0 -2px #433025',
                }}
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 w-5 rounded-l-[2px] bg-[#433025]"
                  style={{ boxShadow: 'inset -2px 0 6px rgba(0,0,0,0.28)' }}
                />
                <span
                  aria-hidden="true"
                  className="absolute inset-y-2 left-6 w-px bg-black/25"
                />
                <span
                  aria-hidden="true"
                  className="absolute -bottom-5 right-8 h-6 w-2.5 shadow-sm transition-transform duration-300 group-hover:translate-y-0.5"
                  style={{
                    backgroundColor: '#B38A4C',
                    clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 76%, 0 100%)',
                  }}
                />
                <div className="relative flex h-full flex-col items-center justify-between p-4 pl-8 text-center">
                  <div className="opacity-80">
                    <ColophonMark symbol="compass" color="#EFE5D4" size={compactScale ? 15 : 18} />
                  </div>
                  <div
                    className="w-full rounded-[2px] border border-[#E5D4B8]/30 px-2.5 py-3"
                    style={{ color: '#F3EBDD' }}
                  >
                    <span
                      className={`block font-hand-caveat font-medium leading-tight ${
                        compactScale ? 'text-[17px]' : 'text-[21px]'
                      }`}
                    >
                      Settings &amp; Craft
                    </span>
                    <span className="mt-1 block font-hand-patrick text-[10px] tracking-wide opacity-75">
                      8-page handbook
                    </span>
                  </div>
                  <span className="font-hand-patrick text-[9.5px] uppercase tracking-[0.16em] text-[#E8DAC2]/65">
                    Press S
                  </span>
                </div>
              </button>
            </div>

            {centerBook && (
              <div className="mt-6 flex flex-wrap items-center gap-3 pr-1 font-hand-kalam text-xs">
                <button
                  type="button"
                  onClick={triggerFolderPicker}
                  className="opacity-70 underline decoration-dotted underline-offset-4 transition-opacity hover:opacity-100"
                  style={{ color: lightSpec.tableInk }}
                >
                  Import folder
                </button>
                <span aria-hidden="true" style={{ color: lightSpec.tableInk, opacity: 0.4 }}>
                  ·
                </span>
                <button
                  type="button"
                  onClick={triggerMultiFilePicker}
                  className="opacity-70 underline decoration-dotted underline-offset-4 transition-opacity hover:opacity-100"
                  style={{ color: lightSpec.tableInk }}
                >
                  Select files (Ctrl+A)
                </button>
                <span aria-hidden="true" style={{ color: lightSpec.tableInk, opacity: 0.4 }}>
                  ·
                </span>
                <button
                  type="button"
                  onClick={triggerFilePicker}
                  className="opacity-70 underline decoration-dotted underline-offset-4 transition-opacity hover:opacity-100"
                  style={{ color: lightSpec.tableInk }}
                >
                  Bind file
                </button>
                <span aria-hidden="true" style={{ color: lightSpec.tableInk, opacity: 0.4 }}>
                  ·
                </span>
                <button
                  type="button"
                  onClick={onBindSampleManuscript}
                  className="opacity-70 underline decoration-dotted underline-offset-4 transition-opacity hover:opacity-100"
                  style={{ color: lightSpec.tableInk }}
                >
                  Sample papers
                </button>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Mobile bottom quiet links (< 768px only) */}
      {centerBook && !layout.isDesktop && (
        <div className="fixed bottom-3 sm:bottom-5 inset-x-2 sm:inset-x-4 z-30 flex flex-wrap items-center justify-center gap-1.5 sm:gap-3 px-2">
          <button
            type="button"
            onClick={onOpenSettingsBook}
            className="inline-flex min-h-[44px] items-center justify-center px-3 py-2 font-hand-kalam text-sm underline decoration-dotted underline-offset-4 opacity-85 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7B5D3B]/60 rounded-xs"
            style={{ color: lightSpec.tableInk }}
          >
            Settings book
          </button>
          <span aria-hidden="true" className="hidden sm:inline" style={{ color: lightSpec.tableInk, opacity: 0.4 }}>
            ·
          </span>
          <button
            type="button"
            onClick={triggerFolderPicker}
            className="inline-flex min-h-[44px] items-center justify-center px-3 py-2 font-hand-kalam text-sm underline decoration-dotted underline-offset-4 opacity-85 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7B5D3B]/60 rounded-xs"
            style={{ color: lightSpec.tableInk }}
          >
            Import folder
          </button>
          <span aria-hidden="true" className="hidden sm:inline" style={{ color: lightSpec.tableInk, opacity: 0.4 }}>
            ·
          </span>
          <button
            type="button"
            onClick={triggerMultiFilePicker}
            className="inline-flex min-h-[44px] items-center justify-center px-3 py-2 font-hand-kalam text-sm underline decoration-dotted underline-offset-4 opacity-85 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7B5D3B]/60 rounded-xs"
            style={{ color: lightSpec.tableInk }}
          >
            {viewport.w < 640 ? 'Select files' : 'Select files (Ctrl+A)'}
          </button>
          {volumes.length > 1 && (
            <>
              <span aria-hidden="true" className="hidden sm:inline" style={{ color: lightSpec.tableInk, opacity: 0.4 }}>
                ·
              </span>
              <button
                type="button"
                onClick={() => setCatalogOpen(true)}
                className="inline-flex min-h-[44px] items-center justify-center px-3 py-2 font-hand-kalam text-sm underline decoration-dotted underline-offset-4 opacity-85 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7B5D3B]/60 rounded-xs"
                style={{ color: lightSpec.tableInk }}
              >
                Other volumes ({volumes.length})
              </button>
            </>
          )}
        </div>
      )}

      {pendingPrompt && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Bind multiple files together or keep separate"
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/25 px-4 backdrop-blur-[1px]"
        >
          <div
            className="relative w-full max-w-sm rounded-[2px] border border-[#C6BBA6] bg-[#F6F1E5] p-7 text-[#2A231C] shadow-2xl"
            style={{ transform: 'rotate(-0.8deg)' }}
          >
            <p className="font-hand-kalam text-xl leading-snug">
              These look like one volume. Bind them together?
            </p>
            <ul className="mt-3 space-y-1 border-y border-[#2A231C]/12 py-2.5 font-hand-patrick text-xs text-[#64594C]">
              {pendingPrompt.fileNames.slice(0, 5).map((name) => (
                <li key={name} className="truncate">
                  {name}
                </li>
              ))}
              {pendingPrompt.fileNames.length > 5 && (
                <li>…and {pendingPrompt.fileNames.length - 5} more</li>
              )}
            </ul>
            <div className="mt-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-5">
                <button
                  type="button"
                  onClick={pendingPrompt.onBindTogether}
                  className="font-hand-kalam text-base text-[#231D17] underline decoration-[#8D6C47] decoration-2 underline-offset-4 hover:text-[#6B4A26]"
                >
                  Bind together
                </button>
                <button
                  type="button"
                  onClick={pendingPrompt.onKeepSeparate}
                  className="font-hand-kalam text-base text-[#5C5145] underline decoration-dotted underline-offset-4 hover:text-[#231D17]"
                >
                  Keep separate
                </button>
              </div>
              <button
                type="button"
                onClick={pendingPrompt.onCancel}
                aria-label="Cancel binding"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xs p-2 font-hand-patrick text-xs text-[#7C7164] transition-colors hover:text-[#2A231C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7B5D3B]/60"
              >
                never mind
              </button>
            </div>
          </div>
        </div>
      )}

      {catalogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Handwritten library catalog"
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 px-4"
          onClick={() => setCatalogOpen(false)}
        >
          <div
            className="ruled-notebook relative w-full max-w-md rounded-[3px] border border-[#BEB39F] bg-[#F5F0E4] p-7 text-[#2A231C] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-hand-kalam text-2xl">Volumes on this table</h2>
              <button
                type="button"
                onClick={() => setCatalogOpen(false)}
                aria-label="Close catalog"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xs p-2.5 font-hand-patrick text-sm text-[#6E6356] transition-colors hover:text-[#241E18] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7B5D3B]/60"
              >
                close
              </button>
            </div>

            <div className="mt-3">
              <label className="sr-only" htmlFor="catalog-search-input">
                Filter volumes by title or author
              </label>
              <input
                id="catalog-search-input"
                type="text"
                value={catalogFilter}
                onChange={(e) => setCatalogFilter(e.target.value)}
                placeholder="Find a title…"
                className="w-full border-b border-[#2A231C]/25 bg-transparent py-1 font-hand-kalam text-base placeholder:text-[#8A7F70] focus:border-[#7B5D3B] focus:outline-none"
              />
            </div>

            <ul className="quiet-scroll mt-4 max-h-72 divide-y divide-[#2A231C]/10 overflow-y-auto pr-1">
              {filteredCatalog.map((vol) => (
                <li key={vol.id} className="py-1">
                  <button
                    type="button"
                    onClick={() => {
                      setCatalogOpen(false);
                      onOpenVolume(vol.id);
                    }}
                    className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xs px-1 py-2 text-left hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7B5D3B]/60"
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <span
                        className="h-5 w-2.5 shrink-0 rounded-[1px]"
                        style={{ backgroundColor: vol.identity.coverColor }}
                        aria-hidden="true"
                      />
                      <span className="truncate font-hand-kalam text-base">{vol.title}</span>
                    </span>
                    <span className="shrink-0 font-hand-patrick text-xs text-[#6E6356]">
                      {vol.author || `${vol.sections.length} sec.`}
                    </span>
                  </button>
                </li>
              ))}
              {filteredCatalog.length === 0 && (
                <li className="py-6 text-center font-hand-kalam text-sm text-[#786D60]">
                  No volume matches that title.
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
