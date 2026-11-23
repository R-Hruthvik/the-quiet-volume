import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BOOK_SIZE_ORDER,
  BOOK_SIZES,
  computeBookCameraTransform,
  getPhysicalBookMetrics,
} from '../lib/dimensions';
import {
  COVER_MATERIALS,
  COVER_SWATCHES,
  ENDPAPER_PATTERNS,
  RIBBON_COLORS,
} from '../lib/identity';
import {
  ENVIRONMENTS,
  LIGHTING_MODES,
  LIGHTING_ORDER,
  PAPER_STOCKS,
  getEnvironmentSpec,
  getLightingSpec,
  getPaperSpec,
} from '../lib/lighting';
import { clampSpreadStart, searchBook } from '../lib/parser';
import { playCoverCloseSound, playPaperTurnSound } from '../lib/sound';
import {
  BrowserVoiceOption,
  getBrowserSpeechVoices,
  isSpeechSupported,
  TTS_VOICE_CATALOG,
} from '../lib/tts';
import {
  chooseAudiobooksDirectory,
  getStoredDirectoryHandle,
  isFileSystemAccessSupported,
} from '../lib/fileSystemStorage';
import { createInitialScrollState, processViewportWheel } from '../lib/viewportScroll';
import { ColophonMark } from './BookOrnaments';
import type {
  BookIdentity,
  BookSizeId,
  BookVolume,
  EnvironmentSurface,
  LightingMode,
  PageFormat,
  PageMode,
  PageSpacing,
  PaginatedPage,
  PaperRuling,
  PaperStock,
  ReaderSettings,
  TTSVoiceOption,
  WritingHand,
  WritingSize,
} from '../types/book';

export const SETTINGS_BOOK_TOTAL_PAGES = 10; // 5 spreads (Pages 0..9)
export const SETTINGS_SEARCH_PAGE_INDEX = 8; // p. 7 (Spread 4, left page)

const SETTINGS_TOC = [
  { pageIndex: 2, displayNum: 1, title: 'Book Dimensions & Sizes', note: 'ISO & novel formats' },
  { pageIndex: 3, displayNum: 2, title: 'Page Format & Ruling', note: 'Notebook, novel, plain or ruled' },
  { pageIndex: 4, displayNum: 3, title: 'Handwriting, Size & Rhythm', note: 'Script, letter size, spacing' },
  { pageIndex: 5, displayNum: 4, title: 'Camera Focus, Zoom & Tilt', note: 'Single focus, spread, live angle' },
  { pageIndex: 6, displayNum: 5, title: 'Light & Paper Stock', note: 'Room illumination & cotton grain' },
  { pageIndex: 7, displayNum: 6, title: 'Cover Cloth, Ribbon & Desk', note: 'Binding craft & reading surface' },
  { pageIndex: 8, displayNum: 7, title: 'Search Inside This Volume', note: 'Handwritten concordance index' },
  { pageIndex: 9, displayNum: 8, title: 'Voice, Comfort & Volume Care', note: 'Read aloud, accessibility, bookplate' },
];

const HAND_OPTIONS: { id: WritingHand; label: string; sample: string; fontClass: string }[] = [
  {
    id: 'kalam',
    label: 'Book hand',
    sample: 'Morning light across the desk makes slow reading calm.',
    fontClass: 'font-hand-kalam text-[13.5px]',
  },
  {
    id: 'patrick',
    label: 'Neat print',
    sample: 'Clear open letters stay effortless across many quiet pages.',
    fontClass: 'font-hand-patrick text-[14.5px]',
  },
  {
    id: 'caveat',
    label: 'Notebook script',
    sample: 'A warmer personal hand for letters, journals, and notes.',
    fontClass: 'font-hand-caveat text-[17.5px]',
  },
  {
    id: 'serif',
    label: 'Clean serif',
    sample: 'A steady book serif whenever handwriting grows tiring.',
    fontClass: 'font-book-serif text-[13px]',
  },
];

const SIZE_OPTIONS: { id: WritingSize; label: string; px: number }[] = [
  { id: 'small', label: 'Small', px: 13 },
  { id: 'compact', label: 'Compact', px: 14.5 },
  { id: 'natural', label: 'Natural', px: 16 },
  { id: 'comfortable', label: 'Comfortable', px: 17.5 },
  { id: 'large', label: 'Large print', px: 19.5 },
];

const SPACING_OPTIONS: { id: PageSpacing; label: string; gapPx: number }[] = [
  { id: 'close', label: 'Close', gapPx: 3 },
  { id: 'natural', label: 'Natural', gapPx: 5 },
  { id: 'airy', label: 'Airy', gapPx: 7 },
];

const RULING_OPTIONS: { id: PaperRuling; label: string; hint: string }[] = [
  { id: 'plain', label: 'Plain', hint: 'Unlined cotton' },
  { id: 'lined', label: 'Lined', hint: 'Horizontal rules' },
  { id: 'margin-lined', label: 'Notebook ruled', hint: 'Lines + margin' },
  { id: 'dot-grid', label: 'Dot grid', hint: 'Fine pin dots' },
  { id: 'graph', label: 'Graph', hint: '5mm square' },
];

interface SettingsBookViewProps {
  volume: BookVolume | null;
  pages: PaginatedPage[];
  settings: ReaderSettings;
  effectiveLighting: LightingMode;
  isReadingAloud: boolean;
  returnTarget: 'reading' | 'table';
  initialPageIndex?: number;
  initialFocusSearch?: boolean;
  onUpdateSettings: (patch: Partial<ReaderSettings>) => void;
  onUpdateVolumeIdentity: (patch: Partial<BookIdentity>) => void;
  onToggleReadAloud: () => void;
  onAdjustCameraLive: () => void;
  onJumpToPageIndex: (pageIndex: number, highlightBlockId?: string) => void;
  onReturn: () => void;
  onCloseAllToTable: () => void;
}

export function SettingsBookView({
  volume,
  pages,
  settings,
  effectiveLighting,
  isReadingAloud,
  returnTarget,
  initialPageIndex = 0,
  initialFocusSearch = false,
  onUpdateSettings,
  onUpdateVolumeIdentity,
  onToggleReadAloud,
  onAdjustCameraLive,
  onJumpToPageIndex,
  onReturn,
  onCloseAllToTable,
}: SettingsBookViewProps) {
  const [viewport, setViewport] = useState({
    w: typeof window !== 'undefined' ? window.innerWidth : 1440,
    h: typeof window !== 'undefined' ? window.innerHeight : 900,
  });
  const [currentPageIndex, setCurrentPageIndex] = useState(() =>
    initialFocusSearch ? SETTINGS_SEARCH_PAGE_INDEX : initialPageIndex
  );
  const [scrollY, setScrollY] = useState(0);
  const [flipLeaf, setFlipLeaf] = useState<{ dir: 'forward' | 'backward'; seq: number } | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [showFineSpacing, setShowFineSpacing] = useState(false);
  const [playingPreview, setPlayingPreview] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [availableBrowserVoices, setAvailableBrowserVoices] = useState<BrowserVoiceOption[]>([]);
  const [audioDirName, setAudioDirName] = useState<string | null>(null);

  useEffect(() => {
    getStoredDirectoryHandle().then((h) => {
      if (h) setAudioDirName(h.name);
    });
  }, []);

  const handlePickAudioDir = async () => {
    const handle = await chooseAudiobooksDirectory();
    if (handle) {
      setAudioDirName(handle.name);
    }
  };

  useEffect(() => {
    const updateVoices = () => {
      setAvailableBrowserVoices(getBrowserSpeechVoices());
    };
    updateVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }
  }, []);

  const handlePlayPreview = useCallback((opt: TTSVoiceOption) => {
    if (!opt.previewUrl) return;
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    if (playingPreview === opt.id) {
      setPlayingPreview(null);
      return;
    }
    const audio = new Audio(opt.previewUrl);
    previewAudioRef.current = audio;
    setPlayingPreview(opt.id);
    audio.onended = () => {
      setPlayingPreview(null);
      previewAudioRef.current = null;
    };
    audio.onerror = () => {
      setPlayingPreview(null);
      previewAudioRef.current = null;
    };
    audio.play().catch(() => setPlayingPreview(null));
  }, [playingPreview]);

  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, []);

  const scrollStateRef = useRef(createInitialScrollState());
  const touchStartRef = useRef<{ x: number; y: number; scrollY: number } | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (initialFocusSearch) {
      setCurrentPageIndex(SETTINGS_SEARCH_PAGE_INDEX);
      window.setTimeout(() => searchInputRef.current?.focus(), 90);
    }
  }, [initialFocusSearch]);

  const effectiveMode: PageMode = viewport.w < 768 ? 'single' : settings.pageMode;
  const clampedPageIndex = Math.max(0, Math.min(currentPageIndex, SETTINGS_BOOK_TOTAL_PAGES - 1));
  const spreadStart = clampSpreadStart(clampedPageIndex, SETTINGS_BOOK_TOTAL_PAGES, 'two-page');
  const activeSide: 'left' | 'right' = clampedPageIndex % 2 === 0 ? 'left' : 'right';

  const leftPageIndex = spreadStart;
  const rightPageIndex = spreadStart + 1;

  // Settings Book shares the exact same constant physical craft dimensions as the reading book
  const metrics = useMemo(() => getPhysicalBookMetrics(settings.bookSize), [settings.bookSize]);
  const camera = useMemo(
    () =>
      computeBookCameraTransform({
        metrics,
        viewportWidth: viewport.w,
        viewportHeight: viewport.h,
        pageMode: effectiveMode,
        activeSide,
        userZoom: settings.cameraZoom,
        scrollY,
      }),
    [metrics, viewport.w, viewport.h, effectiveMode, activeSide, settings.cameraZoom, scrollY]
  );

  useEffect(() => {
    if (scrollY > camera.maxScrollY) {
      setScrollY(camera.maxScrollY);
    }
  }, [camera.maxScrollY, scrollY]);

  const paper = getPaperSpec(settings.paper);
  const lightSpec = getLightingSpec(effectiveLighting);
  const currentSizeSpec = BOOK_SIZES[settings.bookSize] || BOOK_SIZES['a5-notebook'];
  const lightIdx = LIGHTING_ORDER.indexOf(settings.lighting);
  const searchHits = useMemo(() => searchBook(pages, searchQuery), [pages, searchQuery]);
  const currentChapter = SETTINGS_TOC.find((c) => c.pageIndex === clampedPageIndex);
  const chapterTitle =
    currentChapter?.title || (clampedPageIndex === 0 ? 'Companion Handbook' : 'Contents');

  const triggerLeafFlip = useCallback(
    (dir: 'forward' | 'backward') => {
      if (settings.reducedMotion) return;
      setFlipLeaf((prev) => ({ dir, seq: (prev?.seq || 0) + 1 }));
      window.setTimeout(() => {
        setFlipLeaf((curr) => (curr ? null : curr));
      }, 360);
    },
    [settings.reducedMotion]
  );

  const goToPage = useCallback(
    (nextIdx: number, landAtBottom = false) => {
      const target = Math.max(0, Math.min(SETTINGS_BOOK_TOTAL_PAGES - 1, nextIdx));
      if (target === clampedPageIndex) return;
      const targetSpread = clampSpreadStart(target, SETTINGS_BOOK_TOTAL_PAGES, 'two-page');
      if (targetSpread !== spreadStart) {
        playPaperTurnSound(settings.soundEnabled);
        triggerLeafFlip(targetSpread > spreadStart ? 'forward' : 'backward');
      }
      setScrollY(landAtBottom ? camera.maxScrollY : 0);
      scrollStateRef.current = createInitialScrollState();
      setCurrentPageIndex(target);
    },
    [clampedPageIndex, spreadStart, settings.soundEnabled, triggerLeafFlip, camera.maxScrollY]
  );

  const isFirstPage = effectiveMode === 'single' ? clampedPageIndex <= 0 : spreadStart <= 0;
  const isLastPage =
    effectiveMode === 'single'
      ? clampedPageIndex >= SETTINGS_BOOK_TOTAL_PAGES - 1
      : spreadStart + 2 >= SETTINGS_BOOK_TOTAL_PAGES;

  const turnNext = useCallback(() => {
    if (isLastPage) return;
    const step = effectiveMode === 'single' ? 1 : 2;
    const nextIdx = effectiveMode === 'single' ? clampedPageIndex + 1 : spreadStart + step;
    goToPage(nextIdx, false);
  }, [isLastPage, effectiveMode, clampedPageIndex, spreadStart, goToPage]);

  const turnPrev = useCallback(
    (landAtBottom = false) => {
      if (isFirstPage) return;
      const step = effectiveMode === 'single' ? 1 : 2;
      const prevIdx = effectiveMode === 'single' ? clampedPageIndex - 1 : spreadStart - step;
      goToPage(prevIdx, landAtBottom);
    },
    [isFirstPage, effectiveMode, clampedPageIndex, spreadStart, goToPage]
  );

  const handleCloseSettingsBook = useCallback(() => {
    playCoverCloseSound(settings.soundEnabled);
    onReturn();
  }, [settings.soundEnabled, onReturn]);

  // Identical keyboard navigation as the reading book!
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if (e.key === 'Escape') {
        e.preventDefault();
        handleCloseSettingsBook();
        return;
      }
      if (isEditable) return;

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const isZoomIn =
        e.key === '+' ||
        e.key === '=' ||
        (!e.shiftKey && (e.key === 'z' || e.key === 'Z'));

      const isZoomOut =
        e.key === '-' ||
        e.key === '_' ||
        e.key === 'x' ||
        e.key === 'X' ||
        (e.shiftKey && (e.key === 'Z' || e.key === 'z'));

      const isZoomReset = e.key === '0';

      if (isZoomIn) {
        e.preventDefault();
        const current = settings.cameraZoom ?? 1.0;
        const next = Math.min(2.4, Math.round((current + 0.1) * 100) / 100);
        onUpdateSettings({ cameraZoom: next });
      } else if (isZoomOut) {
        e.preventDefault();
        const current = settings.cameraZoom ?? 1.0;
        const next = Math.max(0.65, Math.round((current - 0.1) * 100) / 100);
        onUpdateSettings({ cameraZoom: next });
      } else if (isZoomReset) {
        e.preventDefault();
        onUpdateSettings({ cameraZoom: 1.0 });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        turnNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        turnPrev(false);
      } else if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        if (camera.canScrollVertically && scrollY < camera.maxScrollY - 4) {
          setScrollY((prev) => Math.min(camera.maxScrollY, prev + Math.round(viewport.h * 0.45)));
        } else {
          turnNext();
        }
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        if (camera.canScrollVertically && scrollY > 4) {
          setScrollY((prev) => Math.max(0, prev - Math.round(viewport.h * 0.45)));
        } else {
          turnPrev(false);
        }
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        handleCloseSettingsBook();
      } else if (e.key === '/') {
        e.preventDefault();
        goToPage(SETTINGS_SEARCH_PAGE_INDEX);
        window.setTimeout(() => searchInputRef.current?.focus(), 60);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    handleCloseSettingsBook,
    turnNext,
    turnPrev,
    goToPage,
    camera.canScrollVertically,
    camera.maxScrollY,
    scrollY,
    viewport.h,
    settings.cameraZoom,
    onUpdateSettings,
  ]);

  // Same decoupled scroll-before-flip event engine as the reading book
  const handleWheel = (e: React.WheelEvent) => {
    // Let inner scrollable lists (e.g. search results) scroll natively first
    const scrollableAncestor = (e.target as HTMLElement | null)?.closest(
      '[data-inner-scroll="true"]'
    ) as HTMLElement | null;
    if (scrollableAncestor) {
      const canScrollDown =
        scrollableAncestor.scrollTop + scrollableAncestor.clientHeight <
        scrollableAncestor.scrollHeight - 2;
      const canScrollUp = scrollableAncestor.scrollTop > 2;
      if ((e.deltaY > 0 && canScrollDown) || (e.deltaY < 0 && canScrollUp)) {
        return;
      }
    }

    const res = processViewportWheel(scrollStateRef.current, {
      deltaX: e.deltaX,
      deltaY: e.deltaY,
      now: Date.now(),
      scrollY,
      maxScrollY: camera.maxScrollY,
      canScrollVertically: camera.canScrollVertically,
      isFirstPage,
      isLastPage,
    });
    scrollStateRef.current = res.nextState;

    if (res.action === 'scroll') {
      setScrollY(res.nextScrollY);
    } else if (res.action === 'turn-next') {
      turnNext();
    } else if (res.action === 'turn-prev') {
      turnPrev(camera.canScrollVertically);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (t) touchStartRef.current = { x: t.clientX, y: t.clientY, scrollY };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current || !camera.canScrollVertically) return;
    const t = e.touches[0];
    if (!t) return;
    const dy = touchStartRef.current.y - t.clientY;
    const dx = Math.abs(t.clientX - touchStartRef.current.x);
    if (Math.abs(dy) > dx) {
      const nextY = Math.max(0, Math.min(camera.maxScrollY, touchStartRef.current.scrollY + dy));
      setScrollY(nextY);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    touchStartRef.current = null;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.35) {
      if (dx < 0) turnNext();
      else turnPrev(false);
    }
  };

  const progressRatio = (clampedPageIndex + 1) / SETTINGS_BOOK_TOTAL_PAGES;
  const leftStackWidth = Math.max(6, Math.round(progressRatio * 14));
  const rightStackWidth = Math.max(6, Math.round((1 - progressRatio) * 14));
  const tiltDeg = settings.reducedTexture ? 0 : settings.cameraTilt;

  // Live framing preview math (used on Page 5 — Camera Focus, Zoom & Tilt)
  const previewScale = Math.min(1.4, Math.max(0.68, settings.cameraZoom));
  const previewRatio = currentSizeSpec.widthMm / currentSizeSpec.heightMm;

  const renderPageHeader = (displayNum: number, sectionLabel: string, side: 'left' | 'right') => (
    <header
      className={`mb-3 flex shrink-0 items-center justify-between border-b pb-1 font-hand-patrick text-[11px] ${
        side === 'left' ? 'flex-row-reverse' : 'flex-row'
      }`}
      style={{
        borderColor: `${paper.ink}1C`,
        color: paper.pencilInk,
      }}
    >
      <div className="flex items-center gap-1 min-w-0">
        <span className="truncate opacity-80 mr-1">{sectionLabel}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goToPage(1);
          }}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center shrink-0 px-2 underline decoration-dotted underline-offset-2 opacity-75 transition-opacity hover:opacity-100 active:opacity-100 cursor-pointer"
          style={{ color: paper.pencilInk }}
          aria-label="Go to contents"
        >
          contents
        </button>
        <span aria-hidden="true" className="opacity-40 select-none">·</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleCloseSettingsBook();
          }}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center shrink-0 px-2 underline decoration-dotted underline-offset-2 opacity-75 transition-opacity hover:opacity-100 active:opacity-100 cursor-pointer"
          style={{ color: paper.pencilInk }}
          aria-label="Close handbook"
        >
          Close
        </button>
      </div>
      <span className="shrink-0 tabular-nums opacity-85">p. {displayNum}</span>
    </header>
  );

  const renderPageBody = (pageIdx: number, side: 'left' | 'right') => {
    const padLeft = side === 'left' ? 24 : 30;
    const padRight = side === 'right' ? 24 : 30;
    const pagePadding: React.CSSProperties = {
      paddingLeft: `${padLeft}px`,
      paddingRight: `${padRight}px`,
      paddingTop: '18px',
      paddingBottom: viewport.w < 768 ? '68px' : '18px',
    };

    const cardSelected = paper.isDarkPaper
      ? 'border-[#C69C63] bg-white/10'
      : 'border-[#7C5E3E] bg-[#EFE5D2]';
    const cardIdle = paper.isDarkPaper
      ? 'border-white/15 bg-white/[0.03] hover:border-white/30'
      : 'border-[#27211B]/15 bg-white/45 hover:border-[#27211B]/32';

    switch (pageIdx) {
      // PAGE 0: TITLE & RETURN PAGE
      case 0:
        return (
          <div
            className="flex h-full flex-col items-center justify-between text-center"
            style={{ ...pagePadding, paddingTop: '36px', paddingBottom: '28px', color: paper.ink }}
          >
            <div className="opacity-65">
              <ColophonMark symbol="compass" color={paper.ink} size={24} />
            </div>

            <div className="max-w-[270px] space-y-3">
              <p
                className="font-hand-patrick text-[11px] uppercase tracking-[0.2em] opacity-65"
                style={{ color: paper.pencilInk }}
              >
                Companion Handbook
              </p>
              <h1 className="font-hand-caveat text-[34px] font-medium leading-tight">
                Settings &amp; Book Craft
              </h1>
              <p className="font-hand-kalam text-sm leading-relaxed" style={{ color: paper.mutedInk }}>
                Every adjustment lives on its own quiet page. Turn through just like your reading
                volume.
              </p>
              {volume && (
                <p
                  className="pt-2 font-hand-patrick text-xs italic opacity-75"
                  style={{ color: paper.pencilInk }}
                >
                  Open beside “{volume.title}”
                </p>
              )}
            </div>

            <div className="w-full max-w-[280px] space-y-3">
              <div className="flex flex-wrap items-center justify-center gap-2 font-hand-kalam text-[15px]">
                <button
                  type="button"
                  onClick={handleCloseSettingsBook}
                  className="flex min-h-[44px] items-center justify-center px-3 text-center underline decoration-[#8D6C47] decoration-2 underline-offset-4 transition-opacity hover:opacity-75 active:opacity-60 cursor-pointer"
                  style={{ color: paper.ink }}
                >
                  {returnTarget === 'reading' ? 'Return to reading' : 'Close to desk'}
                </button>
                {volume && returnTarget === 'reading' && (
                  <button
                    type="button"
                    onClick={onCloseAllToTable}
                    className="flex min-h-[44px] items-center justify-center px-3 text-center underline decoration-dotted underline-offset-4 opacity-75 transition-opacity hover:opacity-100 active:opacity-60 cursor-pointer"
                    style={{ color: paper.mutedInk }}
                  >
                    Put book on desk
                  </button>
                )}
              </div>

              {volume && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={onAdjustCameraLive}
                    className="flex min-h-[44px] items-center justify-center px-3 text-center font-hand-patrick text-xs underline decoration-dotted underline-offset-4 opacity-80 transition-opacity hover:opacity-100 active:opacity-60 cursor-pointer"
                    style={{ color: paper.pencilInk }}
                  >
                    Adjust camera live on open page
                  </button>
                </div>
              )}

              <p
                className="pt-2 font-hand-patrick text-[11px] opacity-60 text-center"
                style={{ color: paper.pencilInk }}
              >
                {viewport.w < 640
                  ? 'Swipe or tap Next to browse settings'
                  : 'Keys: ← → turn pages · S return · / search · Esc close'}
              </p>
            </div>
          </div>
        );

      // PAGE 1: HANDWRITTEN TABLE OF CONTENTS FOR SETTINGS BOOK
      case 1:
        return (
          <div className="flex h-full flex-col" style={{ ...pagePadding, paddingTop: '28px', color: paper.ink }}>
            <div className="flex items-baseline justify-between border-b pb-2" style={{ borderColor: `${paper.ink}1C` }}>
              <h2 className="font-hand-caveat text-[26px] font-medium leading-none">Contents</h2>
              <span className="font-hand-patrick text-[11px] opacity-65" style={{ color: paper.pencilInk }}>
                8 pages
              </span>
            </div>

            <nav aria-label="Settings book contents" className="mt-4 flex-1">
              <ol className="space-y-1.5">
                {SETTINGS_TOC.map((entry) => (
                  <li key={entry.pageIndex}>
                    <button
                      type="button"
                      onClick={() => goToPage(entry.pageIndex)}
                      className="group flex min-h-[44px] w-full flex-col justify-center rounded-[3px] py-2.5 px-3 text-left transition-all hover:bg-black/[0.04] active:bg-black/[0.08] active:scale-[0.99] cursor-pointer"
                    >
                      <div className="flex w-full items-baseline justify-between gap-2">
                        <span className="font-hand-kalam text-[15px] leading-snug group-hover:opacity-85">
                          {entry.title}
                        </span>
                        <span
                          aria-hidden="true"
                          className="flex-1 border-b border-dotted"
                          style={{ borderColor: `${paper.ink}25` }}
                        />
                        <span
                          className="shrink-0 font-hand-patrick text-xs tabular-nums"
                          style={{ color: paper.pencilInk }}
                        >
                          {entry.displayNum}
                        </span>
                      </div>
                      <span
                        className="block font-hand-patrick text-[11px] opacity-65 group-hover:opacity-80"
                        style={{ color: paper.pencilInk }}
                      >
                        {entry.note}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </nav>

            <p className="mt-2 font-hand-patrick text-[11px] italic opacity-60" style={{ color: paper.pencilInk }}>
              Tap any entry or turn the right edge to begin.
            </p>
          </div>
        );

      // PAGE 2 (p. 1): BOOK DIMENSIONS & SIZES
      case 2:
        return (
          <div className="flex h-full flex-col" style={{ ...pagePadding, color: paper.ink }}>
            {renderPageHeader(1, 'Book Dimensions & Sizes', side)}

            <h2 className="font-hand-caveat text-[24px] font-medium leading-tight">
              Physical book size
            </h2>
            <p className="mt-1 font-hand-patrick text-xs leading-snug" style={{ color: paper.mutedInk }}>
              Every format holds constant real-life proportions across the desk, single-page focus,
              and two-page spread.
            </p>

            <div className="mt-4 grid flex-1 grid-cols-2 content-start gap-2.5">
              {BOOK_SIZE_ORDER.map((sizeId: BookSizeId) => {
                const spec = BOOK_SIZES[sizeId];
                const selected = settings.bookSize === sizeId;
                const miniW = Math.round((spec.widthMm / 210) * 30);
                const miniH = Math.round((spec.heightMm / 297) * 42);
                return (
                  <button
                    key={sizeId}
                    type="button"
                    onClick={() => onUpdateSettings({ bookSize: sizeId })}
                    aria-pressed={selected}
                    className={`flex min-h-[44px] flex-col items-start rounded-[3px] border p-2.5 text-left transition-all cursor-pointer active:scale-[0.99] ${
                      selected ? cardSelected : cardIdle
                    }`}
                  >
                    <div className="flex w-full items-end justify-between gap-2">
                      <span
                        aria-hidden="true"
                        className="inline-block rounded-[1px] border bg-[#FAF6EC]"
                        style={{
                          width: `${Math.max(16, miniW)}px`,
                          height: `${Math.max(22, miniH)}px`,
                          borderColor: `${paper.ink}55`,
                        }}
                      />
                      <span className="font-book-mono text-[10px] tabular-nums opacity-75">
                        {spec.widthMm}×{spec.heightMm}
                      </span>
                    </div>
                    <span className="mt-2 font-hand-kalam text-[14px] leading-tight">
                      {spec.label}
                    </span>
                    <span className="mt-0.5 font-hand-patrick text-[10.5px] opacity-70">
                      {spec.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );

      // PAGE 3 (p. 2): PAGE FORMAT & PAPER RULING
      case 3:
        return (
          <div className="flex h-full flex-col" style={{ ...pagePadding, color: paper.ink }}>
            {renderPageHeader(2, 'Page Format & Ruling', side)}

            <h2 className="font-hand-caveat text-[24px] font-medium leading-tight">
              Page layout format
            </h2>
            <p className="mt-1 font-hand-patrick text-xs" style={{ color: paper.mutedInk }}>
              Notebook format is the quiet default; switch to classic novel proportions anytime.
            </p>

            <div className="mt-3 grid grid-cols-2 gap-3">
              {(
                [
                  {
                    id: 'notebook' as PageFormat,
                    title: 'Notebook format',
                    desc: 'Tight edges, top header strip, continuous writing sheet',
                  },
                  {
                    id: 'novel' as PageFormat,
                    title: 'Novel book format',
                    desc: 'Generous margins, drop caps, classic chapter openers',
                  },
                ]
              ).map((opt) => {
                const selected = settings.pageFormat === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onUpdateSettings({ pageFormat: opt.id })}
                    aria-pressed={selected}
                    className={`rounded-[3px] border p-3 text-left transition-all ${
                      selected ? cardSelected : cardIdle
                    }`}
                  >
                    {/* Miniature layout diagram */}
                    <div
                      aria-hidden="true"
                      className="mb-2.5 flex h-16 w-12 flex-col rounded-[1px] border bg-white/60"
                      style={{
                        borderColor: `${paper.ink}35`,
                        padding: opt.id === 'notebook' ? '4px 4px' : '9px 7px',
                      }}
                    >
                      {opt.id === 'notebook' && (
                        <div className="mb-1.5 flex justify-between border-b border-black/20 pb-0.5">
                          <span className="h-0.5 w-4 bg-black/35" />
                          <span className="h-0.5 w-1.5 bg-black/35" />
                        </div>
                      )}
                      <div className="space-y-1 opacity-45">
                        <div className="h-0.5 w-full bg-black" />
                        <div className="h-0.5 w-11/12 bg-black" />
                        <div className="h-0.5 w-full bg-black" />
                        <div className="h-0.5 w-4/5 bg-black" />
                        {opt.id === 'notebook' && <div className="h-0.5 w-full bg-black" />}
                      </div>
                    </div>
                    <span className="block font-hand-kalam text-[14.5px] leading-tight">
                      {opt.title}
                    </span>
                    <span className="mt-1 block font-hand-patrick text-[11px] leading-snug opacity-75">
                      {opt.desc}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5">
              <h3 className="font-hand-caveat text-[21px] font-medium leading-tight">
                Paper ruling
              </h3>
              <p className="mt-0.5 font-hand-patrick text-xs" style={{ color: paper.mutedInk }}>
                Unlined plain cotton by default.
              </p>

              <div className="mt-2.5 grid grid-cols-2 gap-2">
                {RULING_OPTIONS.map((opt) => {
                  const selected = settings.paperRuling === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onUpdateSettings({ paperRuling: opt.id })}
                      aria-pressed={selected}
                      className={`flex min-h-[44px] items-center gap-2.5 rounded-[3px] border px-2.5 py-2 text-left transition-all cursor-pointer active:scale-[0.99] ${
                        selected ? cardSelected : cardIdle
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`h-8 w-7 shrink-0 rounded-[1px] border bg-[#FAF6EC] ${
                          opt.id === 'lined' || opt.id === 'margin-lined'
                            ? 'ruling-lined'
                            : opt.id === 'dot-grid'
                            ? 'ruling-dot-grid'
                            : opt.id === 'graph'
                            ? 'ruling-graph'
                            : ''
                        }`}
                        style={
                          {
                            borderColor: `${paper.ink}35`,
                            borderLeftWidth: opt.id === 'margin-lined' ? '2px' : '1px',
                            borderLeftColor:
                              opt.id === 'margin-lined' ? 'rgba(182, 92, 96, 0.55)' : `${paper.ink}35`,
                            '--rule-line': 'rgba(108, 122, 142, 0.28)',
                            '--rule-dot': 'rgba(108, 98, 86, 0.35)',
                          } as React.CSSProperties
                        }
                      />
                      <span className="min-w-0">
                        <span className="block font-hand-kalam text-[13px] leading-tight">
                          {opt.label}
                        </span>
                        <span className="block font-hand-patrick text-[10.5px] opacity-70">
                          {opt.hint}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );

      // PAGE 4 (p. 3): HANDWRITING, SIZE & RHYTHM
      case 4:
        return (
          <div className="flex h-full flex-col" style={{ ...pagePadding, color: paper.ink }}>
            {renderPageHeader(3, 'Handwriting, Size & Rhythm', side)}

            <h2 className="font-hand-caveat text-[23px] font-medium leading-tight">
              Handwriting &amp; type
            </h2>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {HAND_OPTIONS.map((opt) => {
                const selected = settings.writingHand === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onUpdateSettings({ writingHand: opt.id })}
                    aria-pressed={selected}
                    className={`rounded-[3px] border px-2.5 py-2 text-left transition-all ${
                      selected ? cardSelected : cardIdle
                    }`}
                  >
                    <span className="block font-hand-patrick text-[10.5px] opacity-70">
                      {opt.label}
                    </span>
                    <span className={`mt-0.5 block leading-snug ${opt.fontClass}`}>
                      {opt.sample}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4">
              <h3 className="font-hand-patrick text-xs opacity-75">Writing size</h3>
              <div className="mt-1 space-y-0.5">
                {SIZE_OPTIONS.map((opt) => {
                  const selected = settings.writingSize === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onUpdateSettings({ writingSize: opt.id })}
                      aria-pressed={selected}
                      className="flex w-full items-baseline justify-between gap-2 py-0.5 text-left transition-opacity hover:opacity-80"
                    >
                      <span
                        className="font-hand-kalam leading-tight"
                        style={{
                          fontSize: `${opt.px}px`,
                          textDecoration: selected ? 'underline' : 'none',
                          textDecorationColor: '#7C5E3E',
                          textDecorationThickness: '2px',
                          textUnderlineOffset: '3px',
                        }}
                      >
                        A quiet volume waits here.
                      </span>
                      <span className="shrink-0 font-hand-patrick text-[11px] opacity-70">
                        {opt.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-baseline justify-between">
                <h3 className="font-hand-patrick text-xs opacity-75">Page spacing</h3>
                <button
                  type="button"
                  onClick={() => setShowFineSpacing((prev) => !prev)}
                  aria-expanded={showFineSpacing}
                  className="font-hand-patrick text-[11px] underline decoration-dotted underline-offset-2 opacity-75 hover:opacity-100"
                >
                  {showFineSpacing ? 'Fold fine sliders' : 'Fine line & margin'}
                </button>
              </div>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {SPACING_OPTIONS.map((opt) => {
                  const selected = settings.pageSpacing === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() =>
                        onUpdateSettings({
                          pageSpacing: opt.id,
                          fineLineHeight: undefined,
                          fineMarginScale: undefined,
                        })
                      }
                      aria-pressed={selected}
                      className={`flex flex-col items-center rounded-[3px] border py-1.5 transition-all ${
                        selected ? cardSelected : cardIdle
                      }`}
                    >
                      <div
                        className="flex h-6 w-8 flex-col justify-center"
                        style={{ gap: `${opt.gapPx}px` }}
                        aria-hidden="true"
                      >
                        <span className="h-px w-full bg-current opacity-55" />
                        <span className="h-px w-4/5 bg-current opacity-55" />
                        <span className="h-px w-full bg-current opacity-55" />
                      </div>
                      <span className="mt-1 font-hand-kalam text-xs">{opt.label}</span>
                    </button>
                  );
                })}
              </div>

              {showFineSpacing && (
                <div
                  className="mt-2 grid grid-cols-2 gap-3 rounded-[3px] border border-dashed p-2.5 font-hand-patrick text-[11px]"
                  style={{ borderColor: `${paper.ink}24` }}
                >
                  <label className="flex flex-col gap-1">
                    <span>Line rhythm ({(settings.fineLineHeight || 1.66).toFixed(2)})</span>
                    <input
                      type="range"
                      min="1.45"
                      max="2.05"
                      step="0.05"
                      value={settings.fineLineHeight || 1.66}
                      onChange={(e) =>
                        onUpdateSettings({ fineLineHeight: parseFloat(e.target.value) })
                      }
                      className="accent-[#7C5E3E]"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span>Margin breath ({(settings.fineMarginScale || 1).toFixed(2)}×)</span>
                    <input
                      type="range"
                      min="0.85"
                      max="1.25"
                      step="0.05"
                      value={settings.fineMarginScale || 1}
                      onChange={(e) =>
                        onUpdateSettings({ fineMarginScale: parseFloat(e.target.value) })
                      }
                      className="accent-[#7C5E3E]"
                    />
                  </label>
                </div>
              )}
            </div>
          </div>
        );

      // PAGE 5 (p. 4): CAMERA FOCUS, ZOOM & TILT
      case 5:
        return (
          <div className="flex h-full flex-col" style={{ ...pagePadding, color: paper.ink }}>
            {renderPageHeader(4, 'Camera Focus, Zoom & Tilt', side)}

            <h2 className="font-hand-caveat text-[24px] font-medium leading-tight">
              Reading camera &amp; view
            </h2>

            <div className="mt-2.5 grid grid-cols-2 gap-2.5">
              {(
                [
                  {
                    id: 'single' as PageMode,
                    title: 'Single-page focus',
                    desc: 'Camera focuses close on one leaf while spine & opposite page stay intact',
                  },
                  {
                    id: 'two-page' as PageMode,
                    title: 'Two-page spread',
                    desc: 'Camera pulls back to show both pages open across the center gutter',
                  },
                ]
              ).map((opt) => {
                const selected = settings.pageMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onUpdateSettings({ pageMode: opt.id })}
                    aria-pressed={selected}
                    className={`rounded-[3px] border p-2.5 text-left transition-all ${
                      selected ? cardSelected : cardIdle
                    }`}
                  >
                    <span className="block font-hand-kalam text-[14px] leading-tight">
                      {opt.title}
                    </span>
                    <span className="mt-1 block font-hand-patrick text-[10.5px] leading-snug opacity-75">
                      {opt.desc}
                    </span>
                  </button>
                );
              })}
            </div>

            <div
              className="mt-3.5 space-y-3 rounded-[3px] border p-3"
              style={{ borderColor: `${paper.ink}1A` }}
            >
              <label className="block">
                <div className="flex items-baseline justify-between font-hand-kalam text-[13.5px]">
                  <span>Camera zoom</span>
                  <span className="font-book-mono text-[11px] tabular-nums opacity-80">
                    {Math.round(settings.cameraZoom * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.65"
                  max="2.4"
                  step="0.05"
                  aria-label="Camera zoom (+ / = or Z in, - or x out, 0 reset)"
                  value={settings.cameraZoom}
                  onChange={(e) => onUpdateSettings({ cameraZoom: parseFloat(e.target.value) })}
                  className="mt-1 w-full accent-[#7C5E3E]"
                />
                <p className="mt-1 font-hand-patrick text-[11px] opacity-70">
                  Shortcuts: <kbd className="rounded border border-current px-1 py-0.5 text-[10px] font-mono">+</kbd> / <kbd className="rounded border border-current px-1 py-0.5 text-[10px] font-mono">-</kbd> (or <kbd className="rounded border border-current px-1 py-0.5 text-[10px] font-mono">Z</kbd> / <kbd className="rounded border border-current px-1 py-0.5 text-[10px] font-mono">x</kbd>) · <kbd className="rounded border border-current px-1 py-0.5 text-[10px] font-mono">0</kbd> to reset
                </p>
              </label>

              <label className="block border-t pt-2.5" style={{ borderColor: `${paper.ink}12` }}>
                <div className="flex items-baseline justify-between font-hand-kalam text-[13.5px]">
                  <span>First-person camera tilt</span>
                  <span className="font-book-mono text-[11px] tabular-nums opacity-80">
                    {settings.cameraTilt}°
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="18"
                  step="1"
                  aria-label="First-person camera tilt"
                  value={settings.cameraTilt}
                  onChange={(e) =>
                    onUpdateSettings({ cameraTilt: parseInt(e.target.value, 10) })
                  }
                  className="mt-1 w-full accent-[#7C5E3E]"
                />
              </label>
            </div>

            {/* Live framing miniature output right on the page */}
            <div
              className="relative mt-3 flex flex-1 min-h-[124px] items-center justify-center overflow-hidden rounded-[3px] border shadow-inner"
              style={{
                borderColor: `${paper.ink}24`,
                background: getEnvironmentSpec(settings.environment).fallbackBg,
              }}
            >
              <div
                className="transition-transform duration-300 ease-out"
                style={{
                  transform: `perspective(600px) rotateX(${settings.cameraTilt}deg) translateX(${
                    settings.pageMode === 'single' ? '-25%' : '0%'
                  }) scale(${settings.pageMode === 'single' ? previewScale * 0.92 : previewScale * 0.66})`,
                }}
              >
                <div
                  className="flex rounded-[3px] p-1 shadow-xl"
                  style={{
                    backgroundColor: volume?.identity.coverColor || '#5A4336',
                    width: `${Math.round(145 * previewRatio * 2)}px`,
                    height: '145px',
                  }}
                >
                  <div
                    className="grid flex-1 grid-cols-2 overflow-hidden rounded-[1px]"
                    style={{ backgroundColor: paper.pageBg }}
                  >
                    <div
                      className="border-r p-2 space-y-1 opacity-55"
                      style={{ borderColor: `${paper.ink}18`, color: paper.ink }}
                    >
                      <div className="h-1 w-3/4 bg-current" />
                      <div className="h-0.5 w-full bg-current" />
                      <div className="h-0.5 w-5/6 bg-current" />
                      <div className="h-0.5 w-full bg-current" />
                    </div>
                    <div className="p-2" style={{ color: paper.ink }}>
                      <p className="font-hand-kalam text-[7.5px] leading-snug opacity-85">
                        Scroll smoothly through the entire page before crossing the edge.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <span className="pointer-events-none absolute bottom-1.5 right-2 rounded-[2px] bg-black/55 px-2 py-0.5 font-book-mono text-[9.5px] text-[#F5EFE2]">
                {settings.pageMode === 'single' ? 'Single' : 'Spread'} ·{' '}
                {Math.round(settings.cameraZoom * 100)}% · {settings.cameraTilt}°
              </span>
            </div>

            <div className="mt-2.5 flex items-center justify-between gap-2 font-hand-kalam text-xs">
              {volume ? (
                <button
                  type="button"
                  onClick={onAdjustCameraLive}
                  className="underline decoration-[#8D6C47] decoration-2 underline-offset-4 hover:opacity-75"
                >
                  Adjust live directly on open book
                </button>
              ) : (
                <span className="font-hand-patrick text-[11px] opacity-65">
                  Applies immediately to all books
                </span>
              )}
              <button
                type="button"
                onClick={() => onUpdateSettings({ cameraZoom: 1.0, cameraTilt: 8 })}
                className="font-hand-patrick text-[11px] underline decoration-dotted underline-offset-2 opacity-75 hover:opacity-100"
              >
                Reset camera
              </button>
            </div>
          </div>
        );

      // PAGE 6 (p. 5): LIGHT & PAPER STOCK
      case 6:
        return (
          <div className="flex h-full flex-col" style={{ ...pagePadding, color: paper.ink }}>
            {renderPageHeader(5, 'Light & Paper Stock', side)}

            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-hand-caveat text-[23px] font-medium leading-tight">
                Light in the room
              </h2>
              <label className="flex cursor-pointer items-center gap-1.5 font-hand-patrick text-[11px] opacity-80">
                <input
                  type="checkbox"
                  checked={settings.autoLighting}
                  onChange={(e) => onUpdateSettings({ autoLighting: e.target.checked })}
                  className="accent-[#7C5E3E]"
                />
                <span>Follow time outside</span>
              </label>
            </div>

            <div
              className="mt-2.5 rounded-[3px] border px-3 py-3.5"
              style={{ borderColor: `${paper.ink}18` }}
            >
              <div className="relative flex items-center justify-between">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute left-4 right-4 top-3.5 h-px opacity-25"
                  style={{ backgroundColor: paper.ink }}
                />
                {LIGHTING_ORDER.map((mode: LightingMode) => {
                  const spec = getLightingSpec(mode);
                  const active = !settings.autoLighting && settings.lighting === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => onUpdateSettings({ lighting: mode, autoLighting: false })}
                      aria-pressed={active}
                      className="relative z-10 flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 px-0.5 text-center transition-transform hover:-translate-y-0.5 active:scale-95 cursor-pointer"
                    >
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-full border text-sm transition-colors ${
                          active
                            ? 'border-[#8D6B3C] bg-[#B79259] text-[#FDFBF7] shadow-sm'
                            : 'border-[#27211B]/25 bg-[#FAF6EC] text-[#4C4238]'
                        }`}
                      >
                        {spec.symbol}
                      </span>
                      <span className="font-hand-patrick text-[10.5px] opacity-80">
                        {spec.shortLabel}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-center font-hand-patrick text-[11px] opacity-70">
                {settings.autoLighting
                  ? 'Gradually follows your local hour outside.'
                  : `${getLightingSpec(settings.lighting).label} illumination`}
              </p>
            </div>

            <div className="mt-5 flex-1">
              <h3 className="font-hand-caveat text-[22px] font-medium leading-tight">
                Cotton paper stock
              </h3>
              <p className="mt-0.5 font-hand-patrick text-[11px] opacity-75">
                Physical paper tone, independent from room light.
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2.5">
                {(Object.keys(PAPER_STOCKS) as PaperStock[]).map((stockId) => {
                  const stock = getPaperSpec(stockId);
                  const selected = settings.paper === stockId;
                  return (
                    <button
                      key={stockId}
                      type="button"
                      onClick={() => onUpdateSettings({ paper: stockId })}
                      aria-pressed={selected}
                      className={`relative flex min-h-[44px] flex-col justify-center rounded-[2px] border px-3 pt-3.5 pb-2.5 text-left shadow-xs transition-transform hover:-translate-y-0.5 active:scale-[0.99] cursor-pointer ${
                        stock.isDarkPaper ? 'texture-paper-dark' : 'texture-paper-grain'
                      } ${selected ? 'ring-2 ring-[#8A6A42]' : ''}`}
                      style={{
                        backgroundColor: stock.pageBg,
                        color: stock.ink,
                        borderColor: stock.pageEdgeDark,
                      }}
                    >
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute -top-1.5 left-1/2 h-2.5 w-7 -translate-x-1/2 -rotate-2 bg-[#E6DCC3]/85"
                      />
                      <span className="block font-hand-kalam text-xs leading-tight">
                        {stock.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );

      // PAGE 7 (p. 6): COVER CLOTH, RIBBON & READING DESK
      case 7:
        return (
          <div className="flex h-full flex-col" style={{ ...pagePadding, color: paper.ink }}>
            {renderPageHeader(6, 'Cover Cloth, Ribbon & Desk', side)}

            <div>
              <h2 className="font-hand-caveat text-[23px] font-medium leading-tight">
                {volume ? `Binding for “${volume.title}”` : 'Volume binding'}
              </h2>
              {volume ? (
                <>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {COVER_SWATCHES.map((sw) => {
                      const selected = volume.identity.coverColor === sw.coverColor;
                      return (
                        <button
                          key={sw.id}
                          type="button"
                          onClick={() =>
                            onUpdateVolumeIdentity({
                              coverColor: sw.coverColor,
                              spineColor: sw.spineColor,
                              inkOnCover: sw.inkOnCover,
                            })
                          }
                          aria-label={`Cover color: ${sw.name}`}
                          aria-pressed={selected}
                          title={sw.name}
                          className="flex min-h-[44px] min-w-[44px] items-center justify-center p-1 cursor-pointer transition-transform hover:scale-105 active:scale-95"
                        >
                          <span
                            aria-hidden="true"
                            className={`h-7 w-7 rounded-[2px] border block ${
                              selected ? 'ring-2 ring-[#7C5E3E] ring-offset-1' : 'border-black/20'
                            }`}
                            style={{ backgroundColor: sw.coverColor }}
                          />
                        </button>
                      );
                    })}
                    <span className="mx-0.5 h-5 w-px bg-current opacity-20" aria-hidden="true" />
                    {RIBBON_COLORS.map((rb) => {
                      const selected = volume.identity.ribbonColor === rb.color;
                      return (
                        <button
                          key={rb.id}
                          type="button"
                          onClick={() => onUpdateVolumeIdentity({ ribbonColor: rb.color })}
                          aria-label={`Ribbon color: ${rb.name}`}
                          aria-pressed={selected}
                          title={`Ribbon: ${rb.name}`}
                          className="flex min-h-[44px] min-w-[44px] items-center justify-center p-1 cursor-pointer transition-transform hover:scale-105 active:scale-95"
                        >
                          <span
                            aria-hidden="true"
                            className={`h-7 w-4 rounded-b-[1px] block ${
                              selected ? 'ring-2 ring-[#7C5E3E] ring-offset-1' : ''
                            }`}
                            style={{
                              backgroundColor: rb.color,
                              clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 80%, 0 100%)',
                            }}
                          />
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-x-2 gap-y-1 font-hand-patrick text-xs">
                    {COVER_MATERIALS.map((mat) => (
                      <button
                        key={mat.id}
                        type="button"
                        onClick={() => onUpdateVolumeIdentity({ coverMaterial: mat.id })}
                        className={`flex min-h-[44px] items-center justify-center px-2 cursor-pointer transition-opacity ${
                          volume.identity.coverMaterial === mat.id
                            ? 'underline decoration-[#7C5E3E] decoration-2 underline-offset-4'
                            : 'opacity-70 hover:opacity-100 active:opacity-100'
                        }`}
                      >
                        {mat.label}
                      </button>
                    ))}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-hand-patrick text-[11.5px] opacity-80">
                    <span className="opacity-65 mr-1">Endpaper:</span>
                    {ENDPAPER_PATTERNS.map((pat) => (
                      <button
                        key={pat.id}
                        type="button"
                        onClick={() => onUpdateVolumeIdentity({ endpaperPattern: pat.id })}
                        className={`flex min-h-[44px] items-center justify-center px-1.5 cursor-pointer transition-opacity ${
                          volume.identity.endpaperPattern === pat.id
                            ? 'underline decoration-dotted underline-offset-2 opacity-100'
                            : 'opacity-70 hover:opacity-100 active:opacity-100'
                        }`}
                      >
                        {pat.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-2 font-hand-patrick text-xs opacity-70">
                  Open a bound volume first to rebind its cloth, ribbon, and endpapers.
                </p>
              )}
            </div>

            <div className="mt-5 flex-1">
              <h3 className="font-hand-caveat text-[22px] font-medium leading-tight">
                Reading desk surface
              </h3>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                {(Object.keys(ENVIRONMENTS) as EnvironmentSurface[]).map((envId) => {
                  const env = getEnvironmentSpec(envId);
                  const selected = settings.environment === envId;
                  return (
                    <button
                      key={envId}
                      type="button"
                      onClick={() => onUpdateSettings({ environment: envId })}
                      aria-pressed={selected}
                      className={`flex min-h-[44px] items-center gap-2.5 rounded-[3px] border px-2.5 py-2 text-left transition-all cursor-pointer active:scale-[0.99] ${
                        selected ? cardSelected : cardIdle
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className="h-4 w-5 shrink-0 rounded-[1px] border border-black/20"
                        style={{ background: env.fallbackBg }}
                      />
                      <span className="font-hand-kalam text-xs">{env.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );

      // PAGE 8 (p. 7): SEARCH INSIDE THIS VOLUME
      case 8:
        return (
          <div className="flex h-full flex-col" style={{ ...pagePadding, color: paper.ink }}>
            {renderPageHeader(7, 'Search Inside This Volume', side)}

            <h2 className="font-hand-caveat text-[24px] font-medium leading-tight">
              Volume index card
            </h2>

            {volume ? (
              <div className="mt-3 flex flex-1 flex-col min-h-0">
                <div className="flex items-baseline justify-between gap-2">
                  <label
                    htmlFor="settings-book-search-input"
                    className="font-hand-kalam text-sm opacity-80"
                  >
                    Find in “{volume.title}”:
                  </label>
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center font-hand-patrick text-xs opacity-65 hover:opacity-100 cursor-pointer"
                    >
                      clear
                    </button>
                  )}
                </div>

                <input
                  ref={searchInputRef}
                  id="settings-book-search-input"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="type a word or phrase…"
                  className="mt-2 w-full border-b bg-transparent pb-1.5 font-hand-kalam text-base focus:outline-none"
                  style={{ borderColor: `${paper.ink}30`, color: paper.ink }}
                />

                <div
                  data-inner-scroll="true"
                  className="quiet-scroll mt-3.5 flex-1 overflow-y-auto pr-1"
                >
                  {searchQuery.trim().length >= 2 ? (
                    searchHits.length > 0 ? (
                      <ul className="space-y-1">
                        {searchHits.map((hit, idx) => (
                          <li key={`${hit.pageIndex}-${hit.blockId}-${idx}`}>
                            <button
                              type="button"
                              onClick={() => onJumpToPageIndex(hit.pageIndex, hit.blockId)}
                              className="flex min-h-[44px] w-full items-baseline gap-2.5 text-left transition-opacity hover:opacity-70 cursor-pointer"
                            >
                              <span className="w-10 shrink-0 font-hand-patrick text-xs tabular-nums opacity-75">
                                p. {hit.displayNumber}
                              </span>
                              <span className="truncate font-hand-kalam text-[13.5px]">
                                “{hit.snippet}”
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="font-hand-kalam text-sm italic opacity-65">
                        Nothing on these pages matches “{searchQuery}”.
                      </p>
                    )
                  ) : (
                    <p className="font-hand-patrick text-xs leading-relaxed opacity-65">
                      Type at least two letters to search every paragraph in this volume and turn
                      straight to the passage.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-4 font-hand-kalam text-sm opacity-70">
                Open a book from the desk first to search its passages here.
              </p>
            )}
          </div>
        );

      // PAGE 9 (p. 8): VOICE, AI TTS MODELS & QUIET HABITS
      case 9:
      default: {
        const currentSpeed = settings.ttsSpeed || 1.0;
        return (
          <div className="flex h-full flex-col overflow-y-auto pr-1" style={{ ...pagePadding, color: paper.ink }}>
            {renderPageHeader(8, 'AI Voice & Quiet Habits', side)}

            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-hand-caveat text-[23px] font-medium leading-tight">
                AI Voice &amp; Read Aloud
              </h2>
              {volume && (
                <button
                  type="button"
                  onClick={onToggleReadAloud}
                  className="flex min-h-[44px] items-center justify-center rounded-[3px] border border-black/20 bg-black/5 px-2.5 py-1 font-hand-kalam text-xs transition-colors hover:bg-black/10 active:bg-black/20 cursor-pointer"
                >
                  {isReadingAloud ? '⏹ Stop reading' : '▶ Read volume aloud'}
                </button>
              )}
            </div>

            {/* Audio Delivery Mode: Recorded / Cached (Default) vs Live */}
            <div className="mt-3 rounded-[3px] border border-black/15 bg-black/[0.02] p-2">
              <div className="flex items-center justify-between font-hand-patrick text-xs font-semibold mb-1.5">
                <span>Audio Delivery Mode:</span>
                <span className="text-[10px] uppercase font-book-mono tracking-wider opacity-60">
                  {settings.ttsAudioMode === 'live' ? '⚡ Live Mode' : '⏺ Recorded Mode (Default)'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ ttsAudioMode: 'recorded' })}
                  className={`flex flex-col items-start rounded-[3px] border p-2 text-left transition-all cursor-pointer ${
                    (settings.ttsAudioMode || 'recorded') === 'recorded'
                      ? 'border-[#7C5E3E] bg-[#7C5E3E]/10 ring-1 ring-[#7C5E3E]/30 font-medium'
                      : 'border-black/15 bg-white/40 hover:bg-black/5 opacity-75'
                  }`}
                >
                  <span className="font-hand-caveat text-sm font-semibold flex items-center gap-1">
                    <span>⏺</span> Recorded (Default)
                  </span>
                  <span className="font-hand-patrick text-[10px] opacity-75 leading-tight mt-0.5">
                    Saves speech offline. Replays cost $0 with zero lag.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onUpdateSettings({ ttsAudioMode: 'live' })}
                  className={`flex flex-col items-start rounded-[3px] border p-2 text-left transition-all cursor-pointer ${
                    settings.ttsAudioMode === 'live'
                      ? 'border-[#7C5E3E] bg-[#7C5E3E]/10 ring-1 ring-[#7C5E3E]/30 font-medium'
                      : 'border-black/15 bg-white/40 hover:bg-black/5 opacity-75'
                  }`}
                >
                  <span className="font-hand-caveat text-sm font-semibold flex items-center gap-1">
                    <span>⚡</span> Always Live
                  </span>
                  <span className="font-hand-patrick text-[10px] opacity-75 leading-tight mt-0.5">
                    Streams fresh real-time audio on every read.
                  </span>
                </button>
              </div>
            </div>

            {/* Direct Local Folder Selection for Single Chapter MP3s */}
            <div className="mt-2.5 rounded-[3px] border border-black/15 bg-black/[0.02] p-2 space-y-1.5">
              <div className="flex items-center justify-between font-hand-patrick text-xs font-semibold">
                <span className="flex items-center gap-1.5">
                  <span>📁</span> Audiobooks Folder on Disk
                </span>
                <span className="text-[10px] font-book-mono opacity-60">
                  {audioDirName || 'Not selected'}
                </span>
              </div>
              <p className="font-hand-patrick text-[11px] opacity-75 leading-tight">
                Stores clean, full chapter <code>.mp3</code> files directly in your chosen folder on disk.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePickAudioDir}
                  className="flex min-h-[36px] items-center gap-1 rounded-[2px] border border-black/20 bg-black/5 px-2.5 py-1 font-hand-kalam text-xs transition-colors hover:bg-black/10 active:bg-black/15 cursor-pointer"
                >
                  <span>📂</span>
                  <span>{audioDirName ? 'Change Folder' : 'Select Folder on Disk'}</span>
                </button>
                {audioDirName && (
                  <span className="font-hand-patrick text-xs text-emerald-800 flex items-center gap-1">
                    ✓ Active
                  </span>
                )}
              </div>
            </div>

            {/* Model & Voice Selection: Deepgram Primary (cheap) first, then ElevenLabs, then Native */}
            <div className="mt-3 space-y-2">
              <div className="flex items-baseline justify-between font-hand-patrick text-xs opacity-75">
                <span>Select AI narrator (cheap to best voice):</span>
                <span>Speed: {currentSpeed}x</span>
              </div>

              <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                {TTS_VOICE_CATALOG.map((opt) => {
                  const isSelected =
                    settings.ttsProvider === opt.provider &&
                    (settings.ttsVoice === opt.voice || (!settings.ttsVoice && opt.voice === 'aura-asteria-en'));
                  const isPlaying = playingPreview === opt.id;

                  return (
                    <div
                      key={opt.id}
                      onClick={() =>
                        onUpdateSettings({
                          ttsProvider: opt.provider,
                          ttsVoice: opt.voice,
                        })
                      }
                      className={`flex min-h-[44px] flex-col justify-center gap-1 rounded-[3px] border p-2.5 transition-all cursor-pointer ${
                        isSelected
                          ? 'border-[#7C5E3E] bg-[#7C5E3E]/10 ring-1 ring-[#7C5E3E]/30'
                          : 'border-black/15 hover:border-black/30 active:bg-black/5 bg-black/[0.02]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-hand-caveat text-[17px] font-medium leading-none">
                            {opt.name}
                          </span>
                          <span
                            className={`rounded-[2px] px-1.5 py-0.5 font-book-mono text-[9px] uppercase tracking-wider ${
                              opt.provider === 'deepgram'
                                ? 'bg-emerald-700/15 text-emerald-900 font-semibold'
                                : opt.provider === 'elevenlabs'
                                ? 'bg-amber-700/15 text-amber-900 font-semibold'
                                : opt.provider === 'fish'
                                ? 'bg-indigo-700/15 text-indigo-900 font-semibold'
                                : opt.provider === 'groq'
                                ? 'bg-orange-700/15 text-orange-900 font-semibold'
                                : 'bg-gray-500/15 text-gray-700'
                            }`}
                          >
                            {opt.costCategory}
                          </span>
                        </div>

                        {opt.previewUrl && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePlayPreview(opt);
                            }}
                            title={isPlaying ? 'Pause voice sample' : 'Listen to voice sample'}
                            className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[2px] border px-2.5 py-1 font-hand-patrick text-[11px] transition-colors cursor-pointer ${
                              isPlaying
                                ? 'border-amber-700 bg-amber-100 text-amber-900'
                                : 'border-black/20 hover:bg-black/8 active:bg-black/15 text-[#3A3026]'
                            }`}
                          >
                            {isPlaying ? '⏸ Pause' : '▶ Sample'}
                          </button>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[11px] font-hand-patrick opacity-80">
                        <span>{opt.style} · {opt.gender}</span>
                        <span className="text-[10px] tabular-nums font-book-mono opacity-90">
                          {opt.allowanceInfo}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Dynamic Browser Voices Dropdown when WebSpeech is chosen */}
              {settings.ttsProvider === 'webspeech' && availableBrowserVoices.length > 0 && (
                <div className="mt-2 rounded-[3px] border border-black/15 bg-black/[0.03] p-2 space-y-1">
                  <div className="flex items-center justify-between font-hand-patrick text-xs font-medium">
                    <span>Installed Browser/OS Voice:</span>
                    <span className="text-[10px] font-book-mono opacity-60">
                      {availableBrowserVoices.length} voices found
                    </span>
                  </div>
                  <select
                    value={settings.ttsVoice || 'edge-natural'}
                    onChange={(e) => onUpdateSettings({ ttsVoice: e.target.value })}
                    className="w-full rounded-[2px] border border-black/20 bg-white/70 px-2 py-1.5 font-hand-patrick text-xs text-[#2A231C]"
                  >
                    <option value="edge-natural">Automatic (Prefer Edge/Google Natural)</option>
                    {availableBrowserVoices.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name} ({v.lang}){v.isNatural ? ' ★ Natural' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Speech speed slider */}
              <div className="mt-2.5 flex items-center justify-between gap-3 border-t pt-2" style={{ borderColor: `${paper.ink}15` }}>
                <span className="font-hand-patrick text-xs opacity-75">Reading tempo</span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0.8"
                    max="1.4"
                    step="0.05"
                    value={currentSpeed}
                    onChange={(e) => onUpdateSettings({ ttsSpeed: parseFloat(e.target.value) })}
                    className="w-24 accent-[#7C5E3E]"
                  />
                  <span className="font-book-mono text-[11px] tabular-nums w-8">
                    {currentSpeed}x
                  </span>
                </div>
              </div>
            </div>

            {/* Reading comfort & habits */}
            <div className="mt-3 space-y-2 border-t pt-2 font-hand-kalam text-[13px]" style={{ borderColor: `${paper.ink}15` }}>
              <p className="font-hand-patrick text-[11px] opacity-70">
                Comfort &amp; quiet habits
              </p>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.reducedMotion}
                  onChange={(e) => onUpdateSettings({ reducedMotion: e.target.checked })}
                  className="accent-[#7C5E3E]"
                />
                <span>Still page turns (reduced motion)</span>
              </label>

              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.reducedTexture}
                  onChange={(e) => onUpdateSettings({ reducedTexture: e.target.checked })}
                  className="accent-[#7C5E3E]"
                />
                <span>Quieter paper texture &amp; flat perspective</span>
              </label>

              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.restReminderEnabled}
                  onChange={(e) => onUpdateSettings({ restReminderEnabled: e.target.checked })}
                  className="accent-[#7C5E3E]"
                />
                <span>Gentle eye-rest whisper during long reading</span>
              </label>
            </div>

            <div
              className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-2.5 font-hand-kalam text-sm"
              style={{ borderColor: `${paper.ink}18` }}
            >
              <button
                type="button"
                onClick={handleCloseSettingsBook}
                className="flex min-h-[44px] items-center justify-center underline decoration-[#8D6C47] decoration-2 underline-offset-4 hover:opacity-75 cursor-pointer"
              >
                {returnTarget === 'reading' ? 'Return to reading' : 'Close handbook'}
              </button>
              {returnTarget === 'reading' && (
                <button
                  type="button"
                  onClick={onCloseAllToTable}
                  className="flex min-h-[44px] items-center justify-center font-hand-patrick text-xs underline decoration-dotted underline-offset-4 opacity-75 hover:opacity-100 cursor-pointer"
                >
                  Close volume to desk
                </button>
              )}
            </div>
          </div>
        );
      }
    }
  };

  const renderPhysicalPage = (pageIdx: number, side: 'left' | 'right') => {
    const pageTint = side === 'left' ? paper.pageLeftTint : paper.pageRightTint;
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

    return (
      <section
        aria-label={`Settings book page ${pageIdx === 0 ? 'Title' : pageIdx === 1 ? 'Contents' : pageIdx - 1}`}
        className="relative flex h-full w-full flex-col overflow-hidden"
        style={{ backgroundColor: pageTint }}
        onClick={() => {
          if (effectiveMode === 'single') {
            if (activeSide === 'right' && side === 'left') goToPage(leftPageIndex);
            else if (activeSide === 'left' && side === 'right') goToPage(rightPageIndex);
          }
        }}
      >
        {!settings.reducedTexture && (
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 z-[2] ${
              paper.isDarkPaper ? 'texture-paper-dark' : 'texture-paper-grain'
            }`}
          />
        )}
        {!settings.reducedTexture && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-10"
            style={{
              background: pageArchShading,
              opacity: lightSpec.gutterOpacity,
            }}
          />
        )}
        <div className="relative z-[6] h-full w-full">{renderPageBody(pageIdx, side)}</div>
      </section>
    );
  };

  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      role="region"
      aria-label="Settings and Book Craft companion volume"
      data-testid="settings-book-stage"
      data-settings-page={clampedPageIndex}
      data-view-mode={effectiveMode}
    >
      <div
        className="relative flex items-center justify-center transition-transform duration-300 ease-out will-change-transform"
        style={{
          transform: `perspective(2200px) rotateX(${tiltDeg}deg) translate3d(${camera.translateX}px, ${camera.translateY}px, 0) scale(${camera.effectiveScale})`,
          transformStyle: 'preserve-3d',
          filter: lightSpec.pageFilter,
        }}
      >
        {/* SEPARATE PHYSICAL HARDCOVER SETTINGS BOOK ("The Binder's Handbook") */}
        <div
          className={`relative flex shrink-0 rounded-[7px] ${
            !settings.reducedTexture ? 'texture-cover-leather' : ''
          }`}
          style={{
            width: `${metrics.outerSpreadWidth}px`,
            height: `${metrics.outerHeight}px`,
            padding: `${metrics.coverPadY}px ${metrics.coverPadX}px`,
            backgroundColor: '#5A4336',
            boxShadow: settings.reducedTexture
              ? '0 10px 28px rgba(0,0,0,0.22)'
              : `${lightSpec.bookShadow}, 0 10px 0 -4px #433025, inset 0 1px 0 rgba(255,255,255,0.16)`,
          }}
        >
          {/* Woven Cloth Spine Headbands */}
          {!settings.reducedTexture && (
            <>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-[5px] left-1/2 z-20 h-[6px] w-[30px] -translate-x-1/2 rounded-t-[2px]"
                style={{
                  background: 'repeating-linear-gradient(90deg, #B38A4C 0 3px, #ECE5D8 3px 6px)',
                  boxShadow: 'inset 0 -1px 2px rgba(0,0,0,0.28)',
                }}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute bottom-[5px] left-1/2 z-20 h-[6px] w-[30px] -translate-x-1/2 rounded-b-[2px]"
                style={{
                  background: 'repeating-linear-gradient(90deg, #B38A4C 0 3px, #ECE5D8 3px 6px)',
                  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.28)',
                }}
              />
            </>
          )}

          {/* Bottom stepped physical paper edge thickness */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-[20px] bottom-[3px] h-[7px] rounded-b-[2px]"
            style={{
              background: `repeating-linear-gradient(to bottom, ${paper.pageEdge} 0px, ${paper.pageEdge} 1.5px, ${paper.pageEdgeDark} 2px, ${paper.pageEdge} 3px)`,
              boxShadow: '0 2px 4px rgba(0,0,0,0.18)',
            }}
          />

          {/* Left Stepped Page Stack (click to turn back) */}
          <button
            type="button"
            aria-label="Turn to previous settings page"
            onClick={() => turnPrev(false)}
            disabled={isFirstPage}
            className="relative shrink-0 cursor-pointer rounded-l-[2px] border-r transition-all duration-300 disabled:cursor-default"
            style={{
              width: `${leftStackWidth}px`,
              background: `repeating-linear-gradient(to right, ${paper.pageEdge} 0px, ${paper.pageEdge} 1.5px, ${paper.pageEdgeDark} 2px, ${paper.pageEdge} 3px)`,
              borderColor: `${paper.ink}18`,
              boxShadow: 'inset 1px 0 3px rgba(0,0,0,0.14)',
            }}
          />

          {/* Open Two-Page Settings Paper Block */}
          <div
            className="relative flex flex-1 overflow-hidden rounded-[2px]"
            style={{
              backgroundColor: paper.pageBg,
              boxShadow: '0 1px 4px rgba(0,0,0,0.16)',
            }}
          >
            {/* Narrow outer edge page-turn zones (kept slim so controls remain freely clickable) */}
            {!isFirstPage && (
              <button
                type="button"
                onClick={() => turnPrev(false)}
                aria-label="Previous settings page"
                className="absolute inset-y-14 left-0 z-20 w-[22px] cursor-w-resize bg-transparent"
              />
            )}
            {!isLastPage && (
              <button
                type="button"
                onClick={turnNext}
                aria-label="Next settings page"
                className="absolute inset-y-14 right-0 z-20 w-[22px] cursor-e-resize bg-transparent"
              />
            )}

            <div className="grid h-full w-full grid-cols-2">
              <div className="relative h-full border-r" style={{ borderColor: `${paper.ink}16` }}>
                {renderPhysicalPage(leftPageIndex, 'left')}
              </div>
              <div className="relative h-full">
                {renderPhysicalPage(rightPageIndex, 'right')}
              </div>
            </div>

            {/* Center Sewn Spine Crease */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-[3px] -translate-x-1/2"
              style={{
                background:
                  'linear-gradient(to right, rgba(25,18,12,0.22), rgba(25,18,12,0.34) 50%, rgba(255,252,245,0.16) 100%)',
              }}
            />

            {/* Animated Physical Turning Leaf */}
            {flipLeaf && (
              <div
                key={flipLeaf.seq}
                aria-hidden="true"
                className={`pointer-events-none absolute inset-y-0 z-30 w-1/2 ${
                  flipLeaf.dir === 'forward'
                    ? 'left-1/2 animate-leaf-forward'
                    : 'left-0 animate-leaf-backward'
                }`}
                style={{
                  backgroundColor: paper.pageBg,
                  boxShadow:
                    flipLeaf.dir === 'forward'
                      ? '-12px 0 24px rgba(18, 12, 6, 0.24)'
                      : '12px 0 24px rgba(18, 12, 6, 0.24)',
                  borderLeft:
                    flipLeaf.dir === 'forward' ? `1px solid ${paper.pageEdgeDark}` : undefined,
                  borderRight:
                    flipLeaf.dir === 'backward' ? `1px solid ${paper.pageEdgeDark}` : undefined,
                }}
              />
            )}

            {/* Brass/Ochre Silk Ribbon in Center Spine — tap to jump to Contents or Return */}
            <button
              type="button"
              onClick={() => {
                if (spreadStart === 0) {
                  handleCloseSettingsBook();
                } else {
                  goToPage(0);
                }
              }}
              aria-label={
                spreadStart === 0
                  ? 'Return from Settings book'
                  : 'Return to Settings book contents'
              }
              title={spreadStart === 0 ? 'Close Settings book (S / Esc)' : 'Jump to Contents'}
              className="absolute top-0 left-1/2 z-20 h-[36px] w-3.5 -translate-x-1/2 cursor-pointer transition-transform hover:translate-y-0.5"
              style={{
                backgroundColor: '#B38A4C',
                clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 80%, 0 100%)',
                boxShadow: '0 3px 6px rgba(0,0,0,0.22)',
              }}
            />
          </div>

          {/* Right Stepped Page Stack (click to turn forward) */}
          <button
            type="button"
            aria-label="Turn to next settings page"
            onClick={turnNext}
            disabled={isLastPage}
            className="relative shrink-0 cursor-pointer rounded-r-[2px] border-l transition-all duration-300 disabled:cursor-default"
            style={{
              width: `${rightStackWidth}px`,
              background: `repeating-linear-gradient(to left, ${paper.pageEdge} 0px, ${paper.pageEdge} 1.5px, ${paper.pageEdgeDark} 2px, ${paper.pageEdge} 3px)`,
              borderColor: `${paper.ink}18`,
              boxShadow: 'inset -1px 0 3px rgba(0,0,0,0.14)',
            }}
          />
        </div>
      </div>

      {/* Subtle Scroll Position Thread when zoomed vertically */}
      {camera.canScrollVertically && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed left-3 top-1/2 z-20 h-28 w-[3px] -translate-y-1/2 rounded-full bg-black/15"
        >
          <div
            className="w-full rounded-full transition-all duration-150"
            style={{
              height: '32%',
              backgroundColor: '#B38A4C',
              transform: `translateY(${
                camera.maxScrollY > 0 ? (camera.clampedScrollY / camera.maxScrollY) * 212 : 0
              }%)`,
            }}
          />
        </div>
      )}

      {/* Mobile Navigation Dock: clean tactile bottom bar on mobile (<768px) */}
      {viewport.w < 768 && (
        <nav
          aria-label="Settings mobile navigation"
          className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 flex max-w-[calc(100vw-1rem)] items-center justify-between gap-1 rounded-full border px-2 py-1 font-hand-patrick text-xs shadow-xl backdrop-blur-md"
          style={{
            backgroundColor: paper.isDarkPaper ? 'rgba(38, 30, 24, 0.95)' : 'rgba(246, 241, 231, 0.95)',
            borderColor: `${paper.ink}35`,
            color: paper.ink,
            boxShadow: '0 8px 24px rgba(0,0,0,0.28), 0 2px 6px rgba(0,0,0,0.16)',
          }}
        >
          <button
            type="button"
            onClick={() => turnPrev(false)}
            disabled={isFirstPage}
            aria-label="Previous settings page"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full px-2 py-1 text-center transition-colors hover:bg-black/10 active:bg-black/20 disabled:pointer-events-none disabled:opacity-30 cursor-pointer"
          >
            ◀ Prev
          </button>
          <button
            type="button"
            onClick={() => goToPage(1)}
            aria-label="Jump to contents"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full px-2.5 py-1 text-center font-medium transition-colors hover:bg-black/10 active:bg-black/20 cursor-pointer"
          >
            Contents
          </button>
          <div
            data-testid="settings-mobile-page-indicator"
            className="flex min-w-[64px] max-w-[110px] flex-col items-center justify-center px-1 text-center select-none"
            title={`p. ${clampedPageIndex} / 8 · ${chapterTitle}`}
          >
            <span className="font-hand-patrick text-xs font-semibold tabular-nums leading-tight">
              p. {clampedPageIndex} / 8
            </span>
            <span className="w-full truncate font-hand-patrick text-[9.5px] opacity-75 leading-tight">
              {chapterTitle}
            </span>
          </div>
          <button
            type="button"
            onClick={turnNext}
            disabled={isLastPage}
            aria-label="Next settings page"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full px-2 py-1 text-center transition-colors hover:bg-black/10 active:bg-black/20 disabled:pointer-events-none disabled:opacity-30 cursor-pointer"
          >
            Next ▶
          </button>
          <button
            type="button"
            onClick={handleCloseSettingsBook}
            aria-label="Close settings book"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full px-2.5 py-1 text-center font-semibold text-[#8D6C47] transition-colors hover:bg-black/10 active:bg-black/20 cursor-pointer"
          >
            Close
          </button>
        </nav>
      )}
    </div>
  );
}
