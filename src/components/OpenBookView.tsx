import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { computeBookCameraTransform, getPhysicalBookMetrics } from '../lib/dimensions';
import { getCoverMaterialClass } from '../lib/identity';
import { getLightingSpec, getPaperSpec } from '../lib/lighting';
import {
  clampSpreadStart,
  estimateReadingProgress,
  findPageIndexByDisplayNumber,
} from '../lib/parser';
import { playCoverCloseSound, playPaperTurnSound, playPencilScratchSound } from '../lib/sound';
import { createInitialScrollState, processViewportWheel } from '../lib/viewportScroll';
import { BookPageSheet } from './BookPageSheet';
import type {
  BookVolume,
  HighlightKind,
  LightingMode,
  PaginatedPage,
  ReaderSettings,
} from '../types/book';

interface OpenBookViewProps {
  volume: BookVolume;
  pages: PaginatedPage[];
  currentPageIndex: number;
  totalVolumesCount: number;
  settings: ReaderSettings;
  effectiveLighting: LightingMode;
  resumeBlockId: string | null;
  isReadingAloud: boolean;
  isSpeechPaused: boolean;
  activeSpeechCue: { blockId: string; sentenceIndex: number } | null;
  liveCameraBarOpen: boolean;
  onToggleLiveCameraBar: (open: boolean) => void;
  onUpdateSettings: (patch: Partial<ReaderSettings>) => void;
  onChangePageIndex: (nextIndex: number) => void;
  onCloseBook: () => void;
  onOpenBackCover: (focusSearch?: boolean) => void;
  onToggleDogEar: (pageIndex: number) => void;
  onAddOrUpdateNote: (blockId: string, text: string, existingId?: string) => void;
  onDeleteNote: (noteId: string) => void;
  onToggleNoteFold: (noteId: string) => void;
  onSetHighlight: (blockId: string, kind: HighlightKind | null) => void;
  onSaveFinalThought: (thought: string) => void;
  onRemoveVolume: (id: string) => void;
  onEmptyReadingRoom: () => void;
  onPauseResumeSpeech: () => void;
  onStopSpeech: () => void;
  onDisableRestReminder: () => void;
}

export function OpenBookView({
  volume,
  pages,
  currentPageIndex,
  totalVolumesCount,
  settings,
  effectiveLighting,
  resumeBlockId,
  isReadingAloud,
  isSpeechPaused,
  activeSpeechCue,
  liveCameraBarOpen,
  onToggleLiveCameraBar,
  onUpdateSettings,
  onChangePageIndex,
  onCloseBook,
  onOpenBackCover,
  onToggleDogEar,
  onAddOrUpdateNote,
  onDeleteNote,
  onToggleNoteFold,
  onSetHighlight,
  onSaveFinalThought,
  onRemoveVolume,
  onEmptyReadingRoom,
  onPauseResumeSpeech,
  onStopSpeech,
  onDisableRestReminder,
}: OpenBookViewProps) {
  const [viewport, setViewport] = useState({
    w: typeof window !== 'undefined' ? window.innerWidth : 1440,
    h: typeof window !== 'undefined' ? window.innerHeight : 900,
  });
  const [scrollY, setScrollY] = useState(0);
  const [flipLeaf, setFlipLeaf] = useState<{ dir: 'forward' | 'backward'; seq: number } | null>(
    null
  );
  const [showEdgeNote, setShowEdgeNote] = useState(false);
  const [ribbonSlidAside, setRibbonSlidAside] = useState(false);
  const [showRibbonControls, setShowRibbonControls] = useState(false);
  const [showRestWhisper, setShowRestWhisper] = useState(false);
  const [hudCollapsed, setHudCollapsed] = useState(true);

  const [boundaryFeedback, setBoundaryFeedback] = useState<{
    side: 'top' | 'bottom' | null;
    ratio: number;
  }>({ side: null, ratio: 0 });

  const TURN_COOLDOWN_MS = 450;
  const lastTurnTimeRef = useRef(0);
  const prevPageIndexRef = useRef(currentPageIndex);
  const [zoomNotice, setZoomNotice] = useState<number | null>(null);
  const zoomNoticeTimerRef = useRef<number | null>(null);

  const triggerZoomNotice = useCallback((newZoom: number) => {
    setZoomNotice(newZoom);
    if (zoomNoticeTimerRef.current) {
      window.clearTimeout(zoomNoticeTimerRef.current);
    }
    zoomNoticeTimerRef.current = window.setTimeout(() => {
      setZoomNotice(null);
    }, 1200);
  }, []);

  useEffect(() => {
    return () => {
      if (zoomNoticeTimerRef.current) {
        window.clearTimeout(zoomNoticeTimerRef.current);
      }
    };
  }, []);

  // When page index changes, guarantee scrollY resets to 0 and suppress residual wheel inertia
  useEffect(() => {
    if (prevPageIndexRef.current !== currentPageIndex) {
      prevPageIndexRef.current = currentPageIndex;
      lastTurnTimeRef.current = Date.now();
      setScrollY(0);
      scrollStateRef.current = {
        ...createInitialScrollState(),
        lockUntilMs: Date.now() + TURN_COOLDOWN_MS,
        lastEventMs: Date.now(),
      };
    }
  }, [currentPageIndex]);

  const scrollStateRef = useRef(createInitialScrollState());
  const touchStartRef = useRef<{ x: number; y: number; scrollY: number } | null>(null);
  const sessionStartRef = useRef(Date.now());
  const turnsSinceRestRef = useRef(0);

  useEffect(() => {
    const handleViewportChange = () =>
      setViewport({ w: window.innerWidth, h: window.innerHeight });

    window.addEventListener('resize', handleViewportChange);

    // Watch for browser zoom changes (Ctrl +/-) which change devicePixelRatio
    let dprMatch: MediaQueryList | null = null;
    const bindDprWatcher = () => {
      if (typeof window === 'undefined') return;
      const dpr = window.devicePixelRatio || 1;
      dprMatch = window.matchMedia(`(resolution: ${dpr}dppx)`);
      dprMatch.addEventListener(
        'change',
        () => {
          handleViewportChange();
          bindDprWatcher();
        },
        { once: true }
      );
    };
    bindDprWatcher();

    return () => {
      window.removeEventListener('resize', handleViewportChange);
    };
  }, []);

  useEffect(() => {
    setRibbonSlidAside(false);
    const t = window.setTimeout(() => setRibbonSlidAside(true), 240);
    return () => window.clearTimeout(t);
  }, [volume.id]);

  // Phone uses single-page camera focus; PC/laptop (>= 768px) honors user's setting even under browser zoom
  const effectiveMode = viewport.w < 768 ? 'single' : settings.pageMode;

  // The physical book ALWAYS renders as a real two-page spread [evenIndex, evenIndex + 1]!
  // In single-page mode, `activeSide` focuses the camera smoothly on left (even) or right (odd)
  // while keeping the entire opposite page, spine, and page block physically intact.
  const clampedPageIndex = Math.max(0, Math.min(currentPageIndex, Math.max(0, pages.length - 1)));
  const spreadStart = clampSpreadStart(clampedPageIndex, pages.length, 'two-page');
  const activeSide: 'left' | 'right' = clampedPageIndex % 2 === 0 ? 'left' : 'right';

  const leftPage = pages[spreadStart] || null;
  const rightPage = pages[spreadStart + 1] || null;

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

  // Keep scrollY clamped whenever zoom or viewport changes
  useEffect(() => {
    if (scrollY > camera.maxScrollY) {
      setScrollY(camera.maxScrollY);
    }
  }, [camera.maxScrollY, scrollY]);

  const paper = getPaperSpec(settings.paper);
  const lightSpec = getLightingSpec(effectiveLighting);

  const progress = useMemo(
    () =>
      estimateReadingProgress(
        pages,
        effectiveMode === 'single' ? clampedPageIndex : rightPage?.index ?? spreadStart
      ),
    [pages, effectiveMode, clampedPageIndex, rightPage, spreadStart]
  );

  const maybeShowRestNote = useCallback(() => {
    if (!settings.restReminderEnabled) return;
    turnsSinceRestRef.current += 1;
    const elapsedMinutes = (Date.now() - sessionStartRef.current) / 60000;
    if (elapsedMinutes >= 28 && turnsSinceRestRef.current >= 14) {
      setShowRestWhisper(true);
      turnsSinceRestRef.current = 0;
      window.setTimeout(() => setShowRestWhisper(false), 6500);
    }
  }, [settings.restReminderEnabled]);

  const triggerLeafFlip = useCallback(
    (dir: 'forward' | 'backward') => {
      if (settings.reducedMotion) return;
      setFlipLeaf((prev) => ({ dir, seq: (prev?.seq || 0) + 1 }));
      window.setTimeout(() => {
        setFlipLeaf((curr) => (curr ? null : curr));
      }, 370);
    },
    [settings.reducedMotion]
  );

  const isFirstPage = effectiveMode === 'single' ? clampedPageIndex <= 0 : spreadStart <= 0;
  const isLastPage =
    effectiveMode === 'single'
      ? clampedPageIndex >= pages.length - 1
      : spreadStart + 2 >= pages.length;

  const turnNext = useCallback(() => {
    if (isLastPage) {
      // Never open settings when reaching or scrolling past the last page — settings opens only via key buttons or Settings book
      return;
    }
    const step = effectiveMode === 'single' ? 1 : 2;
    const nextIdx =
      effectiveMode === 'single' ? clampedPageIndex + 1 : spreadStart + step;

    if (nextIdx >= pages.length) return;

    const crossingSpread =
      clampSpreadStart(nextIdx, pages.length, 'two-page') !== spreadStart;
    if (crossingSpread) {
      playPaperTurnSound(settings.soundEnabled);
      triggerLeafFlip('forward');
    }
    const now = Date.now();
    lastTurnTimeRef.current = now;
    setScrollY(0);
    setBoundaryFeedback({ side: null, ratio: 0 });
    scrollStateRef.current = {
      ...createInitialScrollState(),
      lockUntilMs: now + TURN_COOLDOWN_MS,
      lastEventMs: now,
    };
    onChangePageIndex(nextIdx);
    maybeShowRestNote();
  }, [
    isLastPage,
    effectiveMode,
    clampedPageIndex,
    spreadStart,
    pages.length,
    settings.soundEnabled,
    triggerLeafFlip,
    onChangePageIndex,
    maybeShowRestNote,
  ]);

  const turnPrev = useCallback(
    (landAtBottom = false) => {
      if (isFirstPage) return;
      const step = effectiveMode === 'single' ? 1 : 2;
      const prevIdx =
        effectiveMode === 'single' ? clampedPageIndex - 1 : spreadStart - step;

      if (prevIdx < 0) return;

      const crossingSpread =
        clampSpreadStart(prevIdx, pages.length, 'two-page') !== spreadStart;
      if (crossingSpread) {
        playPaperTurnSound(settings.soundEnabled);
        triggerLeafFlip('backward');
      }
      const now = Date.now();
      lastTurnTimeRef.current = now;
      setScrollY(landAtBottom ? camera.maxScrollY : 0);
      setBoundaryFeedback({ side: null, ratio: 0 });
      scrollStateRef.current = {
        ...createInitialScrollState(),
        lockUntilMs: now + TURN_COOLDOWN_MS,
        lastEventMs: now,
      };
      onChangePageIndex(prevIdx);
      maybeShowRestNote();
    },
    [
      isFirstPage,
      effectiveMode,
      clampedPageIndex,
      spreadStart,
      pages.length,
      settings.soundEnabled,
      triggerLeafFlip,
      camera.maxScrollY,
      onChangePageIndex,
      maybeShowRestNote,
    ]
  );

  const handleClose = useCallback(() => {
    playCoverCloseSound(settings.soundEnabled);
    onCloseBook();
  }, [settings.soundEnabled, onCloseBook]);

  const handleSelectTocPage = useCallback(
    (displayPageNumber: number) => {
      const targetIdx = findPageIndexByDisplayNumber(pages, displayPageNumber);
      playPaperTurnSound(settings.soundEnabled);
      setScrollY(0);
      onChangePageIndex(targetIdx);
    },
    [pages, settings.soundEnabled, onChangePageIndex]
  );

  const jumpToFirstPage = useCallback(() => {
    playPaperTurnSound(settings.soundEnabled);
    setScrollY(0);
    onChangePageIndex(0);
  }, [settings.soundEnabled, onChangePageIndex]);

  const jumpToLastPage = useCallback(() => {
    playPaperTurnSound(settings.soundEnabled);
    setScrollY(0);
    onChangePageIndex(Math.max(0, pages.length - 1));
  }, [pages.length, settings.soundEnabled, onChangePageIndex]);

  const jumpToToc = useCallback(() => {
    playPaperTurnSound(settings.soundEnabled);
    setScrollY(0);
    const tocIdx = pages.findIndex((p) => p.kind === 'toc');
    onChangePageIndex(tocIdx >= 0 ? tocIdx : 2);
  }, [pages, settings.soundEnabled, onChangePageIndex]);

  const jumpToNextChapter = useCallback(() => {
    const tocPage = pages.find((p) => p.kind === 'toc');
    const tocEntries = tocPage?.tocEntries || [];
    const currentDisp =
      effectiveMode === 'two-page'
        ? Math.max(leftPage?.displayNumber ?? 0, rightPage?.displayNumber ?? 0)
        : pages[clampedPageIndex]?.displayNumber ?? 0;
    const nextEntry = tocEntries.find((e) => e.pageNumber > currentDisp);
    if (nextEntry) {
      handleSelectTocPage(nextEntry.pageNumber);
    }
  }, [pages, effectiveMode, leftPage, rightPage, clampedPageIndex, handleSelectTocPage]);

  const jumpToPrevChapter = useCallback(() => {
    const tocPage = pages.find((p) => p.kind === 'toc');
    const tocEntries = tocPage?.tocEntries || [];
    const minDisp =
      effectiveMode === 'two-page'
        ? Math.min(
            leftPage?.displayNumber ?? Infinity,
            rightPage?.displayNumber ?? Infinity
          )
        : pages[clampedPageIndex]?.displayNumber ?? 0;
    const effectiveMin = minDisp === Infinity ? (pages[clampedPageIndex]?.displayNumber ?? 0) : minDisp;
    const prevEntry = [...tocEntries]
      .reverse()
      .find((e) => e.pageNumber < effectiveMin);
    if (prevEntry) {
      handleSelectTocPage(prevEntry.pageNumber);
    } else {
      jumpToToc();
    }
  }, [pages, effectiveMode, leftPage, rightPage, clampedPageIndex, handleSelectTocPage, jumpToToc]);

  // Keyboard navigation: PageDown / Space / ArrowDown scrolls within tall zoomed page first,
  // ArrowRight / ArrowLeft always turn pages crisply,
  // Home: first page, End: last page, T: Table of Contents, [/]: prev/next chapter
  // +, =, z/Z (without Shift) zoom in; -, _, x/X, Shift+Z zoom out; 0 resets zoom to 1.0
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
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
        triggerZoomNotice(next);
      } else if (isZoomOut) {
        e.preventDefault();
        const current = settings.cameraZoom ?? 1.0;
        const next = Math.max(0.65, Math.round((current - 0.1) * 100) / 100);
        onUpdateSettings({ cameraZoom: next });
        triggerZoomNotice(next);
      } else if (isZoomReset) {
        e.preventDefault();
        onUpdateSettings({ cameraZoom: 1.0 });
        triggerZoomNotice(1.0);
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
      } else if (e.key === 'Home') {
        e.preventDefault();
        jumpToFirstPage();
      } else if (e.key === 'End') {
        e.preventDefault();
        jumpToLastPage();
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        jumpToToc();
      } else if (e.key === ']' || e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        jumpToNextChapter();
      } else if (e.key === '[' || e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        jumpToPrevChapter();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (liveCameraBarOpen) {
          onToggleLiveCameraBar(false);
        } else {
          handleClose();
        }
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        onOpenBackCover(false);
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        onToggleLiveCameraBar(!liveCameraBarOpen);
      } else if (e.key === '/') {
        e.preventDefault();
        onOpenBackCover(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    turnNext,
    turnPrev,
    jumpToFirstPage,
    jumpToLastPage,
    jumpToToc,
    jumpToNextChapter,
    jumpToPrevChapter,
    camera.canScrollVertically,
    camera.maxScrollY,
    scrollY,
    viewport.h,
    liveCameraBarOpen,
    onToggleLiveCameraBar,
    handleClose,
    onOpenBackCover,
    settings.cameraZoom,
    onUpdateSettings,
    triggerZoomNotice,
  ]);

  /**
   * Decoupled Viewport Scroll & Boundary Page-Turn Handler:
   * 1. If a page turn triggered within ~450ms, suppress residual mousewheel/trackpad
   *    inertia ticks and lock scrollY strictly at 0 so the new page always starts at top.
   * 2. If the pointer is over an inner scrollable sheet (e.g. a dense page or long TOC)
   *    that still has room to scroll in that direction, let it scroll smoothly first.
   * 3. Otherwise, pass the wheel delta through our decoupled ViewportScrollEngine so
   *    tall zoomed pages always pan top-to-bottom first, trackpad momentum is absorbed
   *    at the boundary, and a page turn triggers ONLY on a deliberate push past the edge.
   * 4. On the last page, scrolling down stops cleanly and never opens Settings.
   */
  const handleWheel = (e: React.WheelEvent) => {
    const now = Date.now();
    if (now - lastTurnTimeRef.current < TURN_COOLDOWN_MS) {
      if (scrollY !== 0) {
        setScrollY(0);
      }
      return;
    }

    const scrollableInner = (e.target as HTMLElement | null)?.closest(
      '[data-inner-scroll="true"]'
    ) as HTMLElement | null;
    if (scrollableInner) {
      const canScrollDown =
        scrollableInner.scrollTop + scrollableInner.clientHeight <
        scrollableInner.scrollHeight - 2;
      const canScrollUp = scrollableInner.scrollTop > 2;
      if ((e.deltaY > 0 && canScrollDown) || (e.deltaY < 0 && canScrollUp)) {
        return;
      }
    }

    const res = processViewportWheel(scrollStateRef.current, {
      deltaX: e.deltaX,
      deltaY: e.deltaY,
      now,
      scrollY,
      maxScrollY: camera.maxScrollY,
      canScrollVertically: camera.canScrollVertically,
      isFirstPage,
      isLastPage,
    });
    scrollStateRef.current = res.nextState;

    if (res.action === 'scroll') {
      setScrollY(res.nextScrollY);
      setBoundaryFeedback({ side: null, ratio: 0 });
    } else if (res.action === 'turn-next') {
      turnNext();
    } else if (res.action === 'turn-prev') {
      turnPrev(false);
    } else if (res.boundaryResistance > 0.05) {
      setBoundaryFeedback({ side: res.boundarySide, ratio: res.boundaryResistance });
    } else {
      setBoundaryFeedback({ side: null, ratio: 0 });
    }
  };

  // Touch drag vertically within zoomed page, or swipe horizontally to flip pages
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

  const leftStackWidth = Math.max(6, Math.round(progress.leftStackRatio * 18));
  const rightStackWidth = Math.max(6, Math.round(progress.rightStackRatio * 18));


  const handleDogEar = (pageIdx: number) => {
    playPencilScratchSound(settings.soundEnabled);
    onToggleDogEar(pageIdx);
  };

  const handleNoteSave = (blockId: string, text: string, existingId?: string) => {
    playPencilScratchSound(settings.soundEnabled);
    onAddOrUpdateNote(blockId, text, existingId);
  };

  const tiltDeg = settings.reducedTexture ? 0 : settings.cameraTilt;

  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      data-testid="open-book-stage"
      data-view-mode={effectiveMode}
      data-book-size={settings.bookSize}
      data-scroll-y={Math.round(camera.clampedScrollY)}
      data-max-scroll-y={camera.maxScrollY}
    >
      {/* Floating Quick Navigation HUD bar — docked quietly at the bottom right so it NEVER covers reading text */}
      <nav
        aria-label="Book quick navigation"
        className={`fixed z-30 flex items-center gap-1 sm:gap-1.5 rounded-full border border-black/15 bg-[#F6F1E7]/95 px-2 sm:px-3 py-1 font-hand-patrick text-xs text-[#2A231C] shadow-md backdrop-blur-xs transition-opacity hover:opacity-100 opacity-85 sm:opacity-75 ${
          viewport.w < 640
            ? 'bottom-3 inset-x-3 mx-auto w-fit max-w-[96vw] overflow-x-auto justify-center'
            : 'bottom-3.5 right-4 sm:right-6'
        }`}
      >
        {hudCollapsed ? (
          <button
            type="button"
            onClick={() => setHudCollapsed(false)}
            title="Expand quick navigation"
            aria-label="Expand quick navigation"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 px-3 py-2 rounded-full hover:bg-black/8 transition-colors cursor-pointer touch-manipulation"
          >
            <span>📖</span>
            <span>Nav</span>
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={jumpToFirstPage}
              title="Jump to first page (Home key)"
              className="flex min-h-[40px] items-center justify-center rounded-[3px] px-3 py-2 hover:bg-black/8 transition-colors cursor-pointer touch-manipulation whitespace-nowrap"
            >
              First Page
            </button>
            <span aria-hidden="true" className="opacity-30">|</span>
            <button
              type="button"
              onClick={jumpToToc}
              title="Jump to Table of Contents (T key)"
              className="flex min-h-[40px] items-center justify-center rounded-[3px] px-3 py-2 hover:bg-black/8 transition-colors font-medium cursor-pointer touch-manipulation whitespace-nowrap"
            >
              Contents
            </button>
            <span aria-hidden="true" className="opacity-30">|</span>
            <button
              type="button"
              onClick={jumpToPrevChapter}
              title="Jump to previous chapter ([ or P key)"
              className="flex min-h-[40px] items-center justify-center rounded-[3px] px-3 py-2 hover:bg-black/8 transition-colors cursor-pointer touch-manipulation whitespace-nowrap"
            >
              ◀ Prev Ch
            </button>
            <button
              type="button"
              onClick={jumpToNextChapter}
              title="Jump to next chapter (] or N key)"
              className="flex min-h-[40px] items-center justify-center rounded-[3px] px-3 py-2 hover:bg-black/8 transition-colors cursor-pointer touch-manipulation whitespace-nowrap"
            >
              Next Ch ▶
            </button>
            <span aria-hidden="true" className="opacity-30">|</span>
            <button
              type="button"
              onClick={() => onToggleLiveCameraBar(!liveCameraBarOpen)}
              title="Toggle live camera & zoom (C key)"
              aria-label="Toggle live camera and zoom"
              aria-pressed={liveCameraBarOpen}
              className={`flex min-h-[40px] items-center justify-center gap-1 rounded-[3px] px-3 py-2 hover:bg-black/8 transition-colors cursor-pointer touch-manipulation whitespace-nowrap ${
                liveCameraBarOpen ? 'bg-black/8 font-medium underline decoration-dotted' : ''
              }`}
            >
              <span>📷</span>
              <span>Zoom</span>
            </button>
            <span aria-hidden="true" className="opacity-30">|</span>
            <button
              type="button"
              onClick={() => setHudCollapsed(true)}
              title="Minimize navigation pill"
              aria-label="Close quick navigation"
              className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-[3px] p-2 hover:bg-black/8 transition-colors opacity-60 hover:opacity-100 cursor-pointer touch-manipulation text-xs"
            >
              ✕
            </button>
          </>
        )}
      </nav>

      {/* FIRST-PERSON CAMERA STAGE — tilts slightly like a real seated reader looking down at the book,
          and pans/zooms smoothly onto a single page WITHOUT ever cutting off or resizing the physical book! */}
      <div
        className="relative flex items-center justify-center transition-transform duration-500 ease-out will-change-transform"
        style={{
          transform: `perspective(2200px) rotateX(${tiltDeg}deg) translate3d(${camera.translateX}px, ${camera.translateY}px, 0) scale(${camera.effectiveScale})`,
          transformStyle: 'preserve-3d',
          filter: lightSpec.pageFilter,
        }}
      >
        {/* THE CONSTANT-SIZE PHYSICAL HARDCOVER BOOK (Single page or Two-page spread) */}
        <div
          className={`relative flex shrink-0 rounded-[7px] ${
            !settings.reducedTexture ? getCoverMaterialClass(volume.identity.coverMaterial) : ''
          }`}
          style={{
            width: `${metrics.outerSpreadWidth}px`,
            height: `${metrics.outerHeight}px`,
            padding: `${metrics.coverPadY}px ${metrics.coverPadX}px`,
            backgroundColor: volume.identity.coverColor,
            boxShadow: settings.reducedTexture
              ? '0 10px 28px rgba(0,0,0,0.22)'
              : `${lightSpec.bookShadow}, 0 10px 0 -4px ${volume.identity.spineColor}, inset 0 1px 0 rgba(255,255,255,0.14)`,
          }}
        >
          {/* Woven Cloth Spine Headbands peeking top & bottom of the center binding */}
          {!settings.reducedTexture && (
            <>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-[5px] left-1/2 z-20 h-[6px] w-[30px] -translate-x-1/2 rounded-t-[2px]"
                style={{
                  background: `repeating-linear-gradient(90deg, ${volume.identity.ribbonColor} 0 3px, #ECE5D8 3px 6px)`,
                  boxShadow: 'inset 0 -1px 2px rgba(0,0,0,0.28)',
                }}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute bottom-[5px] left-1/2 z-20 h-[6px] w-[30px] -translate-x-1/2 rounded-b-[2px]"
                style={{
                  background: `repeating-linear-gradient(90deg, ${volume.identity.ribbonColor} 0 3px, #ECE5D8 3px 6px)`,
                  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.28)',
                }}
              />
            </>
          )}

          {/* Bottom stepped physical paper edge thickness beneath both leaves */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-[20px] bottom-[3px] h-[7px] rounded-b-[2px]"
            style={{
              background: `repeating-linear-gradient(to bottom, ${paper.pageEdge} 0px, ${paper.pageEdge} 1.5px, ${paper.pageEdgeDark} 2px, ${paper.pageEdge} 3px)`,
              boxShadow: '0 2px 4px rgba(0,0,0,0.18)',
            }}
          />

          {/* Left Page Stack Thickness (Progress Indicator Embodied Physically) */}
          <button
            type="button"
            aria-label={`Previous page. Currently page ${progress.currentDisplayPage} of ${progress.totalDisplayPages}. Hold to inspect reading time`}
            onClick={() => turnPrev(false)}
            onPointerDown={() => setShowEdgeNote(true)}
            onPointerUp={() => setShowEdgeNote(false)}
            onPointerLeave={() => setShowEdgeNote(false)}
            onBlur={() => setShowEdgeNote(false)}
            className="relative shrink-0 cursor-pointer rounded-l-[2px] border-r transition-all duration-300"
            style={{
              width: `${leftStackWidth}px`,
              background: `repeating-linear-gradient(to right, ${paper.pageEdge} 0px, ${paper.pageEdge} 1.5px, ${paper.pageEdgeDark} 2px, ${paper.pageEdge} 3px)`,
              borderColor: `${paper.ink}18`,
              boxShadow: 'inset 1px 0 3px rgba(0,0,0,0.14)',
            }}
          />

          {/* Main Open Paper Block */}
          <div
            className="relative flex flex-1 overflow-hidden rounded-[2px]"
            style={{
              backgroundColor: paper.pageBg,
              boxShadow: '0 1px 4px rgba(0,0,0,0.16)',
            }}
          >
            {/* Outer-edge quiet tap zones for turning pages */}
            {!isFirstPage && (
              <button
                type="button"
                onClick={() => turnPrev(false)}
                aria-label="Turn to previous page"
                className="absolute inset-y-10 left-0 z-20 w-[44px] cursor-w-resize bg-transparent"
              />
            )}
            {!isLastPage && (
              <button
                type="button"
                onClick={turnNext}
                aria-label="Turn to next page"
                className="absolute inset-y-10 right-0 z-20 w-[44px] cursor-e-resize bg-transparent"
              />
            )}

            {/* Physical Two-Page Paper Leaves (always both pages open on desk; camera zooms & pans to active side) */}
            <div className="grid h-full w-full grid-cols-2">
              <div
                className="relative h-full border-r"
                style={{ borderColor: `${paper.ink}16` }}
              >
                <BookPageSheet
                  page={leftPage}
                  side="left"
                  isFocusedSide={activeSide === 'left'}
                  volume={volume}
                  totalVolumesCount={totalVolumesCount}
                  settings={settings}
                  paper={paper}
                  gutterOpacity={lightSpec.gutterOpacity}
                  isDogEared={Boolean(leftPage && volume.dogEaredPages.includes(leftPage.index))}
                  resumeBlockId={resumeBlockId}
                  activeSpeechCue={activeSpeechCue}
                  onToggleDogEar={handleDogEar}
                  onAddOrUpdateNote={handleNoteSave}
                  onDeleteNote={onDeleteNote}
                  onToggleNoteFold={onToggleNoteFold}
                  onSetHighlight={onSetHighlight}
                  onSelectTocPage={handleSelectTocPage}
                  onSaveFinalThought={onSaveFinalThought}
                  onCloseBook={handleClose}
                  onOpenBackCover={() => onOpenBackCover(false)}
                  onRemoveVolume={onRemoveVolume}
                  onEmptyReadingRoom={onEmptyReadingRoom}
                  onJumpToToc={() => {
                    setScrollY(0);
                    onChangePageIndex(2);
                  }}
                />
              </div>

              <div className="relative h-full">
                <BookPageSheet
                  page={rightPage}
                  side="right"
                  isFocusedSide={activeSide === 'right'}
                  volume={volume}
                  totalVolumesCount={totalVolumesCount}
                  settings={settings}
                  paper={paper}
                  gutterOpacity={lightSpec.gutterOpacity}
                  isDogEared={Boolean(rightPage && volume.dogEaredPages.includes(rightPage.index))}
                  resumeBlockId={resumeBlockId}
                  activeSpeechCue={activeSpeechCue}
                  onToggleDogEar={handleDogEar}
                  onAddOrUpdateNote={handleNoteSave}
                  onDeleteNote={onDeleteNote}
                  onToggleNoteFold={onToggleNoteFold}
                  onSetHighlight={onSetHighlight}
                  onSelectTocPage={handleSelectTocPage}
                  onSaveFinalThought={onSaveFinalThought}
                  onCloseBook={handleClose}
                  onOpenBackCover={() => onOpenBackCover(false)}
                  onRemoveVolume={onRemoveVolume}
                  onEmptyReadingRoom={onEmptyReadingRoom}
                  onJumpToToc={() => {
                    setScrollY(0);
                    onChangePageIndex(2);
                  }}
                />
              </div>
            </div>

            {/* Realistic Center Sewn Spine Crease */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-[3px] -translate-x-1/2"
              style={{
                background:
                  'linear-gradient(to right, rgba(25,18,12,0.22), rgba(25,18,12,0.34) 50%, rgba(255,252,245,0.16) 100%)',
              }}
            />

            {/* Animated Turning Paper Leaf (physical turning sheet across the gutter) */}
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

            {/* Woven Silk Ribbon anchored right in the center spine gutter */}
            <button
              type="button"
              onClick={() => {
                if (isReadingAloud) {
                  setShowRibbonControls((prev) => !prev);
                } else {
                  setShowEdgeNote((prev) => !prev);
                }
              }}
              aria-label={
                isReadingAloud
                  ? 'Toggle read aloud playback controls on ribbon'
                  : 'Silk bookmark ribbon — tap to glimpse page number'
              }
              className="group absolute top-0 z-20 flex justify-center w-6 sm:w-3.5 transition-all duration-700 ease-out focus-visible:opacity-100 before:absolute before:-inset-3 before:content-[''] touch-manipulation cursor-pointer"
              style={{
                left: ribbonSlidAside ? 'calc(50% - 7px)' : 'calc(50% + 20px)',
                height: isReadingAloud ? '46px' : '34px',
              }}
              title={isReadingAloud ? 'Playback controls' : 'Reading ribbon'}
            >
              <span
                aria-hidden="true"
                className="block h-full w-full"
                style={{
                  backgroundColor: volume.identity.ribbonColor,
                  clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 80%, 0 100%)',
                  boxShadow: '0 3px 6px rgba(0,0,0,0.22)',
                  opacity: 0.92,
                }}
              />
            </button>

            {/* Temporary Ribbon Read-Aloud Controls */}
            {isReadingAloud && showRibbonControls && (
              <div
                className="absolute top-12 left-1/2 z-30 flex -translate-x-1/2 items-center gap-4 rounded-[2px] border px-4 py-1.5 font-hand-kalam text-xs shadow-md"
                style={{
                  backgroundColor: paper.pageBg,
                  borderColor: `${paper.ink}25`,
                  color: paper.ink,
                }}
              >
                <button
                  type="button"
                  onClick={onPauseResumeSpeech}
                  className="underline decoration-dotted underline-offset-2"
                >
                  {isSpeechPaused ? 'Resume voice' : 'Pause voice'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onStopSpeech();
                    setShowRibbonControls(false);
                  }}
                  style={{ color: paper.pencilInk }}
                >
                  Stop
                </button>
              </div>
            )}
          </div>

          {/* Right Page Stack Thickness (Progress Remaining Embodied Physically) */}
          <button
            type="button"
            aria-label={`Next page. Page ${progress.currentDisplayPage} of ${progress.totalDisplayPages}, about ${progress.minutesLeftInSection} minutes left in this section`}
            onClick={turnNext}
            onPointerDown={() => setShowEdgeNote(true)}
            onPointerUp={() => setShowEdgeNote(false)}
            onPointerLeave={() => setShowEdgeNote(false)}
            onBlur={() => setShowEdgeNote(false)}
            className="relative shrink-0 cursor-pointer rounded-r-[2px] border-l transition-all duration-300"
            style={{
              width: `${rightStackWidth}px`,
              background: `repeating-linear-gradient(to left, ${paper.pageEdge} 0px, ${paper.pageEdge} 1.5px, ${paper.pageEdgeDark} 2px, ${paper.pageEdge} 3px)`,
              borderColor: `${paper.ink}18`,
              boxShadow: 'inset -1px 0 3px rgba(0,0,0,0.14)',
            }}
          />
        </div>
      </div>

      {/* Subtle Scroll Position Thread when zoomed vertically (shows progress down page & subtle boundary push) */}
      {camera.canScrollVertically && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed left-3 top-1/2 z-20 h-28 w-[3px] -translate-y-1/2 rounded-full bg-black/15"
        >
          <div
            className="w-full rounded-full transition-all duration-150"
            style={{
              height: '32%',
              backgroundColor: volume.identity.ribbonColor,
              transform: `translateY(${
                camera.maxScrollY > 0 ? (camera.clampedScrollY / camera.maxScrollY) * 212 : 0
              }%)`,
              boxShadow:
                boundaryFeedback.ratio > 0.15
                  ? `0 0 6px ${volume.identity.ribbonColor}`
                  : undefined,
            }}
          />
        </div>
      )}

      {/* LIVE CAMERA BAR — Adjust Zoom, First-Person Tilt, and Single/Spread View directly on the live open page! */}
      {liveCameraBarOpen && (
        <aside
          aria-label="Live camera zoom and angle controls"
          data-testid="live-camera-bar"
          className="fixed bottom-4 left-1/2 z-40 flex max-w-[94vw] -translate-x-1/2 flex-wrap items-center justify-center gap-x-5 gap-y-2 rounded-[4px] border px-4 py-2.5 shadow-xl"
          style={{
            backgroundColor: 'rgba(246, 241, 231, 0.96)',
            borderColor: 'rgba(64, 52, 38, 0.28)',
            color: '#2A231C',
          }}
        >
          <div className="flex items-center gap-1 rounded-[3px] border border-[#2A231C]/15 bg-[#EBE3D3] p-0.5 font-hand-kalam text-xs">
            <button
              type="button"
              onClick={() => {
                setScrollY(0);
                onUpdateSettings({ pageMode: 'single' });
              }}
              aria-pressed={settings.pageMode === 'single'}
              className={`rounded-[2px] px-2.5 py-1 transition-colors whitespace-nowrap ${
                settings.pageMode === 'single'
                  ? 'bg-[#FAF6ED] text-[#241E18] shadow-2xs'
                  : 'text-[#665A4D] hover:text-[#241E18]'
              }`}
            >
              Single page
            </button>
            <button
              type="button"
              onClick={() => {
                setScrollY(0);
                onUpdateSettings({ pageMode: 'two-page' });
              }}
              aria-pressed={settings.pageMode === 'two-page'}
              className={`rounded-[2px] px-2.5 py-1 transition-colors whitespace-nowrap ${
                settings.pageMode === 'two-page'
                  ? 'bg-[#FAF6ED] text-[#241E18] shadow-2xs'
                  : 'text-[#665A4D] hover:text-[#241E18]'
              }`}
            >
              Two pages
            </button>
          </div>

          <label
            title="Camera zoom (+ / = or Z to zoom in, - or _ or x to zoom out, 0 to reset)"
            className="flex items-center gap-2 font-hand-patrick text-xs whitespace-nowrap"
          >
            <span className="text-[#5C5145]">Zoom</span>
            <input
              type="range"
              min="0.65"
              max="2.4"
              step="0.05"
              aria-label="Live camera zoom (+ / = or Z in, - or x out, 0 reset)"
              value={settings.cameraZoom}
              onChange={(e) => onUpdateSettings({ cameraZoom: parseFloat(e.target.value) })}
              className="w-24 accent-[#7C5E3E]"
            />
            <span className="w-9 font-book-mono text-[11px] tabular-nums text-[#473D33]">
              {Math.round(settings.cameraZoom * 100)}%
            </span>
            <span
              className="hidden font-book-mono text-[10px] text-[#7A6D5F] sm:inline"
              title="Keyboard shortcuts: + / = or Z to zoom in, - or _ or x to zoom out, 0 to reset"
            >
              [+/-/0]
            </span>
          </label>

          <label className="flex items-center gap-2 font-hand-patrick text-xs whitespace-nowrap">
            <span className="text-[#5C5145]">Tilt</span>
            <input
              type="range"
              min="0"
              max="18"
              step="1"
              aria-label="Live camera tilt angle"
              value={settings.cameraTilt}
              onChange={(e) => onUpdateSettings({ cameraTilt: parseInt(e.target.value, 10) })}
              className="w-20 accent-[#7C5E3E]"
            />
            <span className="w-6 font-book-mono text-[11px] tabular-nums text-[#473D33]">
              {settings.cameraTilt}°
            </span>
          </label>

          <div className="flex items-center gap-3 font-hand-patrick text-xs">
            <button
              type="button"
              onClick={() => {
                setScrollY(0);
                onUpdateSettings({ cameraZoom: 1.0, cameraTilt: 8 });
              }}
              className="text-[#6B5E50] underline decoration-dotted underline-offset-2 hover:text-[#241E18]"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => onToggleLiveCameraBar(false)}
              aria-label="Hide live camera controls"
              className="text-[#241E18] underline underline-offset-2"
            >
              Done
            </button>
          </div>
        </aside>
      )}

      {/* Subtle Camera Zoom Shortcut Toast */}
      {zoomNotice !== null && (
        <aside
          role="status"
          aria-live="polite"
          data-testid="zoom-notice-toast"
          className="pointer-events-none fixed top-6 left-1/2 z-40 -translate-x-1/2 rounded-[3px] border px-4 py-1.5 text-center font-hand-kalam text-xs shadow-md transition-opacity duration-200"
          style={{
            backgroundColor: paper.pageBg,
            borderColor: `${paper.ink}28`,
            color: paper.ink,
          }}
        >
          <span className="font-hand-patrick text-[13.5px] font-medium tracking-wide">
            Camera Zoom: {Math.round(zoomNotice * 100)}%
          </span>
          {zoomNotice >= 1.65 && (
            <span className="ml-1.5 font-book-mono text-[10px] opacity-60">(max)</span>
          )}
          {zoomNotice <= 0.7 && (
            <span className="ml-1.5 font-book-mono text-[10px] opacity-60">(min)</span>
          )}
        </aside>
      )}

      {/* Press-and-hold Pencil Progress Note (vanishes on release) */}
      {showEdgeNote && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-6 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-[2px] border px-3.5 py-1.5 text-center font-hand-kalam text-xs shadow-sm"
          style={{
            backgroundColor: paper.pageBg,
            borderColor: `${paper.ink}22`,
            color: paper.ink,
          }}
        >
          <span>
            Page {progress.currentDisplayPage} of {progress.totalDisplayPages}
          </span>
          <span aria-hidden="true" className="mx-2 opacity-40">
            ·
          </span>
          <span style={{ color: paper.mutedInk }}>
            About {progress.minutesLeftInSection}{' '}
            {progress.minutesLeftInSection === 1 ? 'minute' : 'minutes'} left in this section
          </span>
        </div>
      )}

      {/* Non-blocking faint handwritten eye-rest whisper */}
      {showRestWhisper && (
        <div
          role="status"
          className="fixed bottom-6 right-16 z-30 flex items-center gap-3 rounded-[2px] border px-3 py-1 font-hand-kalam text-xs shadow-xs"
          style={{
            backgroundColor: paper.pageBg,
            borderColor: `${paper.ink}20`,
            color: paper.mutedInk,
          }}
        >
          <span>You have been here for a while. Rest your eyes?</span>
          <button
            type="button"
            onClick={() => {
              setShowRestWhisper(false);
              onDisableRestReminder();
            }}
            className="font-hand-patrick text-[11px] underline decoration-dotted opacity-70 hover:opacity-100"
          >
            quiet
          </button>
        </div>
      )}
    </div>
  );
}
