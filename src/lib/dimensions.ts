import type { BookSizeId, PageMode } from '../types/book';

export interface BookSizeSpec {
  id: BookSizeId;
  label: string;
  category: 'Notebook' | 'Novel';
  widthMm: number;
  heightMm: number;
  dimensionsLabel: string;
  description: string;
}

/**
 * Real-world ISO & publishing physical dimensions (width x height in mm for a single page).
 */
export const BOOK_SIZES: Record<BookSizeId, BookSizeSpec> = {
  'a5-notebook': {
    id: 'a5-notebook',
    label: 'A5 Notebook',
    category: 'Notebook',
    widthMm: 148,
    heightMm: 210,
    dimensionsLabel: '148 × 210 mm',
    description: 'Classic everyday rectangular notebook',
  },
  'b5-composition': {
    id: 'b5-composition',
    label: 'B5 Study Notebook',
    category: 'Notebook',
    widthMm: 176,
    heightMm: 250,
    dimensionsLabel: '176 × 250 mm',
    description: 'Spacious college & studio notebook',
  },
  'a4-folio': {
    id: 'a4-folio',
    label: 'A4 Desk Folio',
    category: 'Notebook',
    widthMm: 210,
    heightMm: 297,
    dimensionsLabel: '210 × 297 mm',
    description: 'Full-sheet manuscript & workbook',
  },
  'pocket-a6': {
    id: 'pocket-a6',
    label: 'Pocket A6',
    category: 'Notebook',
    widthMm: 105,
    heightMm: 148,
    dimensionsLabel: '105 × 148 mm',
    description: 'Compact field & pocket notebook',
  },
  'trade-paperback': {
    id: 'trade-paperback',
    label: 'US Trade Novel',
    category: 'Novel',
    widthMm: 152,
    heightMm: 229,
    dimensionsLabel: '152 × 229 mm (6×9")',
    description: 'Standard paperback & hardcover',
  },
  'uk-b-format': {
    id: 'uk-b-format',
    label: 'B-Format Novel',
    category: 'Novel',
    widthMm: 128,
    heightMm: 198,
    dimensionsLabel: '128 × 198 mm',
    description: 'Traditional literary fiction format',
  },
};

export const BOOK_SIZE_ORDER: BookSizeId[] = [
  'a5-notebook',
  'b5-composition',
  'a4-folio',
  'pocket-a6',
  'trade-paperback',
  'uk-b-format',
];

/**
 * Consistent real-life scale: 3.15 CSS px per physical mm so every book size keeps
 * exact real-world proportions relative to each other and never changes size between
 * closed cover, single-page camera focus, and two-page spread.
 */
export const PX_PER_MM = 3.15;

export interface PhysicalBookMetrics {
  singlePageWidth: number;
  pageHeight: number;
  spreadWidth: number;
  coverPadX: number;
  coverPadY: number;
  outerSpreadWidth: number;
  outerClosedWidth: number;
  outerHeight: number;
}

export function getPhysicalBookMetrics(sizeId: BookSizeId): PhysicalBookMetrics {
  const spec = BOOK_SIZES[sizeId] || BOOK_SIZES['a5-notebook'];
  const singlePageWidth = Math.round(spec.widthMm * PX_PER_MM);
  const pageHeight = Math.round(spec.heightMm * PX_PER_MM);
  const coverPadX = 12;
  const coverPadY = 10;
  const spreadWidth = singlePageWidth * 2;
  return {
    singlePageWidth,
    pageHeight,
    spreadWidth,
    coverPadX,
    coverPadY,
    outerSpreadWidth: spreadWidth + coverPadX * 2 + 28, // includes page stacks
    outerClosedWidth: singlePageWidth + coverPadX * 2 + 12,
    outerHeight: pageHeight + coverPadY * 2,
  };
}

export interface CameraTransformResult {
  effectiveScale: number;
  translateX: number;
  translateY: number;
  maxScrollY: number;
  clampedScrollY: number;
  canScrollVertically: boolean;
}

/**
 * Computes the camera transform over the CONSTANT-SIZE full physical two-page book.
 * - In `two-page` mode, the camera centers on the whole open spread.
 * - In `single` mode, the camera zooms in and pans horizontally onto either the left
 *   or right physical page so the opposite page and spine remain physically present!
 * - Whenever the zoomed book exceeds viewport height, vertical scroll pans smoothly
 *   from top to bottom of the page before any page flip occurs.
 */
export function computeBookCameraTransform(params: {
  metrics: PhysicalBookMetrics;
  viewportWidth: number;
  viewportHeight: number;
  pageMode: PageMode;
  activeSide: 'left' | 'right';
  userZoom: number; // 0.7 to 1.65 (1.0 = natural default)
  scrollY: number; // 0 (top of page) to maxScrollY (bottom of page)
}): CameraTransformResult {
  const {
    metrics,
    viewportWidth,
    viewportHeight,
    pageMode,
    activeSide,
    userZoom,
    scrollY,
  } = params;

  const safeW = Math.max(320, viewportWidth);
  const safeH = Math.max(480, viewportHeight);

  // Baseline scale that fits the physical book naturally on the current screen
  let baseScale: number;

  if (pageMode === 'single') {
    // Single-page focus:
    // On phones (< 640px), fit single page to fill 94% of viewport width
    // On tablets/laptops/desktops (>= 640px), scale single page generously so
    // prose is crisp, large, and comfortably readable without manual zooming
    const singleLeafWidth = metrics.singlePageWidth + metrics.coverPadX;
    if (safeW < 640) {
      baseScale = (safeW * 0.94) / singleLeafWidth;
    } else {
      const fitWidth = (safeW * 0.72) / singleLeafWidth;
      const fitHeight = (safeH * 0.94) / metrics.outerHeight;
      baseScale = Math.min(fitWidth, fitHeight * 1.25);
    }
  } else {
    // Two-page spread: frame the full two-page open book
    // Calibrated with comfortable reading scale so text is never tiny at 1.0 zoom
    const fitW = (safeW * 0.96) / metrics.outerSpreadWidth;
    const fitH = (safeH * 0.94) / metrics.outerHeight;
    baseScale = Math.min(fitW, fitH * 1.14);
  }

  const effectiveScale = Math.max(0.42, Math.min(2.8, baseScale * userZoom));

  // Horizontal camera pan over the full physical two-page book:
  // - In single-page mode:
  //   On phones (< 640px), aligns the active leaf bounds between [edgeMargin, safeW - edgeMargin]
  //   On tablets/laptops/desktops (>= 640px), centers the active page dead-center in the viewport,
  //   pushing the opposite page off to the side so single-page NEVER looks like double-page!
  let translateX = 0;
  const renderedSpreadWidth = metrics.outerSpreadWidth * effectiveScale;
  const renderedPageWidth = metrics.singlePageWidth * effectiveScale;
  const edgeMargin = safeW < 640 ? 8 : safeW < 1024 ? 18 : 28;

  if (pageMode === 'single') {
    if (safeW < 640) {
      const targetShift = safeW / 2 - edgeMargin;
      translateX = activeSide === 'left' ? targetShift : -targetShift;
    } else {
      const centerPageShift = (renderedPageWidth / 2) + (metrics.coverPadX * 0.5 * effectiveScale);
      translateX = activeSide === 'left' ? centerPageShift : -centerPageShift;
    }
  } else {
    if (userZoom > 1.0 && renderedSpreadWidth > safeW * 0.94) {
      const excessWidth = (renderedSpreadWidth - safeW * 0.9) / 2;
      const panAmount = Math.min(excessWidth, metrics.singlePageWidth * 0.46 * effectiveScale);
      translateX = activeSide === 'left' ? panAmount : -panAmount;
    }
  }

  // Vertical overflow: how much taller is the scaled real-size book than the viewport?
  const renderedHeight = metrics.outerHeight * effectiveScale;
  const verticalBreathingRoom = safeW < 640 ? 32 : 52;
  const overflowY = Math.max(0, renderedHeight - (safeH - verticalBreathingRoom));
  const maxScrollY = Math.round(overflowY);
  const clampedScrollY = Math.max(0, Math.min(maxScrollY, scrollY));

  // When overflow exists, scrollY=0 puts top of book nicely near top of viewport;
  // scrollY=maxScrollY puts bottom of book nicely near bottom of viewport.
  const translateY = maxScrollY > 0 ? maxScrollY / 2 - clampedScrollY : 0;

  return {
    effectiveScale,
    translateX: Math.round(translateX),
    translateY: Math.round(translateY),
    maxScrollY,
    clampedScrollY,
    canScrollVertically: maxScrollY > 8,
  };
}

export interface DesktopTableLayout {
  isDesktop: boolean;
  centerW: number;
  centerH: number;
  sideW: number;
  sideH: number;
  settingsW: number;
  settingsH: number;
  stackOffsetX: number;
  stackOffsetY: number;
  columnGap: number;
  uniformScale: number;
}

/**
 * Computes strictly aspect-ratio-locked proportions for the PC & laptop reading desk (>= 768px).
 * Scaling BOTH width and height by a single uniform factor guarantees:
 * 1. Increasing browser zoom (e.g. 125%, 150%, 175% where viewport shrinks to 960×600 or 820×514)
 *    NEVER squishes or shortens the center notebook's height relative to its width.
 * 2. The resting side stack, center book, and Settings Book always stay visible side-by-side
 *    without overflowing or disappearing behind responsive breakpoints.
 */
export function computeDesktopTableLayout(
  metrics: PhysicalBookMetrics,
  viewportWidth: number,
  viewportHeight: number
): DesktopTableLayout {
  const safeW = Math.max(320, viewportWidth);
  const safeH = Math.max(420, viewportHeight);
  const isDesktop = safeW >= 768;

  if (!isDesktop) {
    // Mobile layout unchanged (single centered book filling viewport proportionally)
    const mobileScale = Math.min(
      (safeW * 0.78) / metrics.outerClosedWidth,
      (safeH * 0.66) / metrics.outerHeight,
      0.76
    );
    const centerW = Math.round(metrics.outerClosedWidth * mobileScale);
    const centerH = Math.round(metrics.outerHeight * mobileScale);
    return {
      isDesktop: false,
      centerW,
      centerH,
      sideW: Math.round(centerW * 0.62),
      sideH: Math.round(centerH * 0.62),
      settingsW: Math.round(centerW * 0.66),
      settingsH: Math.round(centerH * 0.66),
      stackOffsetX: 14,
      stackOffsetY: 16,
      columnGap: 20,
      uniformScale: mobileScale,
    };
  }

  // On PC/laptop, budget the full 3-zone horizontal desk footprint proportionally to outerClosedWidth:
  // Left stack (~0.84x) + Center book (1.0x) + Right zone (~0.82x) + 2 calm gaps (~0.36x) = ~3.02x
  const totalWidthUnits = metrics.outerClosedWidth * 3.04;
  const totalHeightUnits = metrics.outerHeight * 1.24; // room for top/bottom table air + ribbon + captions

  const scaleByW = (safeW * 0.92) / totalWidthUnits;
  const scaleByH = (safeH * 0.88) / totalHeightUnits;
  const uniformScale = Math.max(0.36, Math.min(0.76, scaleByW, scaleByH));

  const centerW = Math.round(metrics.outerClosedWidth * uniformScale);
  const centerH = Math.round(metrics.outerHeight * uniformScale);

  // Side stack & Settings Book share the EXACT same true physical book aspect ratio
  const sideRatio = 0.66;
  const settingsRatio = 0.7;

  const sideW = Math.round(centerW * sideRatio);
  const sideH = Math.round(centerH * sideRatio);
  const settingsW = Math.round(centerW * settingsRatio);
  const settingsH = Math.round(centerH * settingsRatio);

  const stackOffsetX = Math.max(10, Math.round(18 * (uniformScale / 0.72)));
  const stackOffsetY = Math.max(12, Math.round(20 * (uniformScale / 0.72)));
  const columnGap = Math.max(20, Math.round(centerW * 0.18));

  return {
    isDesktop: true,
    centerW,
    centerH,
    sideW,
    sideH,
    settingsW,
    settingsH,
    stackOffsetX,
    stackOffsetY,
    columnGap,
    uniformScale,
  };
}

