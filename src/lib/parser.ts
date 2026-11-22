import { BOOK_SIZES } from './dimensions';
import { generateBookIdentity } from './identity';
import type {
  BookBlock,
  BookSection,
  BookSizeId,
  BookVolume,
  PageFormat,
  PageMode,
  PageSpacing,
  PaginatedPage,
  ReaderSettings,
  SearchResult,
  SourceFileMeta,
  TocEntry,
  WritingSize,
} from '../types/book';

export interface ParsedSourceDoc {
  fileName: string;
  title: string;
  author?: string;
  text: string;
  meta: SourceFileMeta;
  ocrNote?: string;
  isTechnical?: boolean;
}

export interface PaginationConfig {
  pageMode: PageMode;
  pageFormat?: PageFormat;
  bookSize?: BookSizeId;
  writingSize: WritingSize;
  pageSpacing: PageSpacing;
  writingHand?: ReaderSettings['writingHand'];
  fineLineHeight?: number;
  fineMarginScale?: number;
}

interface LayoutMetrics {
  contentHeightPx: number;
  contentWidthPx: number;
  lineHeightPx: number;
  paragraphGapPx: number;
  charsPerLine: number;
  chapterTitleLinePx: number;
  chapterTitleGapPx: number;
  headingLinePx: number;
  headingGapPx: number;
  quoteLinePx: number;
  quoteGapPx: number;
  codeLinePx: number;
  codeGapPx: number;
  sceneBreakPx: number;
  sourceNotePx: number;
}

function getFontSizePx(size: WritingSize, hand: ReaderSettings['writingHand']): number {
  const baseMap: Record<WritingSize, number> = {
    small: 13.5,
    compact: 14.8,
    natural: 16,
    comfortable: 17.6,
    large: 19.8,
  };
  const handBoost = hand === 'caveat' ? 3.2 : hand === 'patrick' ? 1.0 : 0;
  return baseMap[size] + handBoost;
}

function getSpacingDefaults(pageFormat: PageFormat, pageSpacing: PageSpacing) {
  return pageFormat === 'notebook'
    ? {
        close: { lineHeight: 1.5, paragraphGapRem: 0.42, outer: 16, inner: 24, top: 12, bottom: 14 },
        natural: { lineHeight: 1.64, paragraphGapRem: 0.56, outer: 20, inner: 28, top: 14, bottom: 16 },
        airy: { lineHeight: 1.8, paragraphGapRem: 0.74, outer: 26, inner: 32, top: 18, bottom: 20 },
      }[pageSpacing]
    : {
        close: { lineHeight: 1.5, paragraphGapRem: 0.18, outer: 26, inner: 32, top: 18, bottom: 12 },
        natural: { lineHeight: 1.62, paragraphGapRem: 0.22, outer: 30, inner: 36, top: 22, bottom: 14 },
        airy: { lineHeight: 1.74, paragraphGapRem: 0.30, outer: 34, inner: 38, top: 24, bottom: 16 },
      }[pageSpacing];
}

function getLayoutMetrics(config: PaginationConfig): LayoutMetrics {
  const pageFormat = config.pageFormat || 'notebook';
  const hand = config.writingHand || 'kalam';
  const bookSize = config.bookSize || 'a5-notebook';
  const sizeSpec = BOOK_SIZES[bookSize] || BOOK_SIZES['a5-notebook'];
  const pageWidthPx = sizeSpec.widthMm * 3.15; // must match PX_PER_MM in dimensions.ts
  const pageHeightPx = sizeSpec.heightMm * 3.15;

  const defaults = getSpacingDefaults(pageFormat, config.pageSpacing);
  const mScale = config.fineMarginScale || 1;
  const padTop = Math.round(defaults.top * mScale);
  const padBottom = Math.round(defaults.bottom * mScale);
  const hasMarginLine = false; // ruling does not change text padding in BookPageSheet
  const innerPad = Math.round((defaults.inner + (hasMarginLine ? 14 : 0)) * mScale);
  const outerPad = Math.round(defaults.outer * mScale);
  // Left/right have same total horizontal padding
  const contentWidthPx = Math.max(180, pageWidthPx - innerPad - outerPad);

  const lineHeight = config.fineLineHeight || defaults.lineHeight;
  const fontSizePx = getFontSizePx(config.writingSize, hand);
  const lineHeightPx = fontSizePx * lineHeight;
  const paragraphGapPx = defaults.paragraphGapRem * 16;

  // Reserve space for notebook header or novel footer, plus a small safety buffer.
  const headerReservePx = pageFormat === 'notebook' ? 34 : 0;
  const footerReservePx = pageFormat === 'novel' ? 26 : 0;
  // Small safety buffer: prefer a little breathing room over clipped text.
  const safetyPx = 14;
  const contentHeightPx = Math.max(
    180,
    pageHeightPx - padTop - padBottom - headerReservePx - footerReservePx - safetyPx
  );

  // Conservative char-width estimate (slightly lower chars/line = safer against clipping).
  const avgCharWidth =
    fontSizePx *
    (hand === 'caveat' ? 0.48 : hand === 'patrick' ? 0.52 : hand === 'serif' ? 0.52 : 0.51);
  const charsPerLine = Math.max(24, Math.floor(contentWidthPx / avgCharWidth));

  const chapterTitleFontPx = pageFormat === 'notebook' ? 23 : 28;
  const chapterTitleLinePx = chapterTitleFontPx * 1.2;
  const chapterTitleGapPx = pageFormat === 'notebook' ? 18 : 26;
  const headingFontPx = 17.5;
  const headingLinePx = headingFontPx * 1.35;
  const headingGapPx = 14;
  const quoteLinePx = Math.max(12, fontSizePx - 0.5) * lineHeight;
  const quoteGapPx = 18;
  const codeLinePx = 10.5 * 1.55;
  const codeGapPx = 24;
  const sceneBreakPx = 30;
  const sourceNotePx = 24;

  return {
    contentHeightPx,
    contentWidthPx,
    lineHeightPx,
    paragraphGapPx,
    charsPerLine,
    chapterTitleLinePx,
    chapterTitleGapPx,
    headingLinePx,
    headingGapPx,
    quoteLinePx,
    quoteGapPx,
    codeLinePx,
    codeGapPx,
    sceneBreakPx,
    sourceNotePx,
  };
}

export function cleanFileStem(fileName: string): string {
  return fileName
    .replace(/\.[^/.]+$/, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractOrderKey(name: string): { num: number | null; text: string } {
  const stem = cleanFileStem(name).toLowerCase();
  const partMatch = stem.match(/(?:part|ch|chapter|vol|volume|section|sec|paper|no|#)\s*0*(\d+)/i);
  if (partMatch) {
    return { num: parseInt(partMatch[1], 10), text: stem };
  }
  const leadingNum = stem.match(/^0*(\d+)[\s.\-_]/);
  if (leadingNum) {
    return { num: parseInt(leadingNum[1], 10), text: stem };
  }
  const trailingNum = stem.match(/[\s.\-_]0*(\d+)$/);
  if (trailingNum) {
    return { num: parseInt(trailingNum[1], 10), text: stem };
  }
  if (/appendix|index|notes|afterword|epilogue/i.test(stem)) {
    return { num: 9999, text: stem };
  }
  if (/preface|foreword|intro|introduction|prologue/i.test(stem)) {
    return { num: 0, text: stem };
  }
  return { num: null, text: stem };
}

export function sortRelatedFiles<T extends { name: string }>(files: T[]): T[] {
  return [...files].sort((a, b) => {
    const ka = extractOrderKey(a.name);
    const kb = extractOrderKey(b.name);
    if (ka.num !== null && kb.num !== null && ka.num !== kb.num) {
      return ka.num - kb.num;
    }
    if (ka.num !== null && kb.num === null) return -1;
    if (ka.num === null && kb.num !== null) return 1;
    return ka.text.localeCompare(kb.text, undefined, { numeric: true });
  });
}

export function deriveCollectionTitle(fileNames: string[]): string {
  const stems = fileNames.map(cleanFileStem);
  if (stems.length === 0) return 'Collected Papers';
  if (stems.length === 1) return stems[0];

  // Try longest common word prefix across at least half the files
  const wordLists = stems.map((s) =>
    s
      .split(/[\s—–\-:]+/)
      .map((w) => w.trim())
      .filter(Boolean)
  );

  let bestPrefix = '';
  for (let i = 0; i < wordLists.length; i++) {
    for (let j = i + 1; j < wordLists.length; j++) {
      const common: string[] = [];
      const len = Math.min(wordLists[i].length, wordLists[j].length);
      for (let k = 0; k < len; k++) {
        if (wordLists[i][k].toLowerCase() === wordLists[j][k].toLowerCase()) {
          common.push(wordLists[i][k]);
        } else {
          break;
        }
      }
      const candidate = common.join(' ').replace(/\b(part|chapter|vol|section)$/i, '').trim();
      if (candidate.length > bestPrefix.length && candidate.length >= 3) {
        bestPrefix = candidate;
      }
    }
  }

  const allPdf = fileNames.every((f) => f.toLowerCase().endsWith('.pdf'));
  const suffix = allPdf ? 'Collected Papers' : 'Collected Volume';

  if (bestPrefix) {
    return `${bestPrefix} — ${suffix}`;
  }

  // If all files are numbered chapters/parts, create a clean range title: e.g. Chapters 148–302
  const nums = fileNames
    .map(extractOrderKey)
    .filter((k) => k.num !== null && k.num > 0 && k.num < 9999)
    .map((k) => k.num as number);
  if (nums.length === fileNames.length && nums.length > 1) {
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    return `Chapters ${min}–${max}`;
  }

  const firstClean = stems[0].replace(/\s*[—–\-:]\s*(part|chapter|vol).*$/i, '').trim();
  return `${firstClean || 'Untitled'} — ${suffix}`;
}

export function shouldAskToBindTogether(files: { name: string }[]): 'single' | 'auto-collect' | 'ask' {
  if (files.length <= 1) return 'single';
  const stems = files.map((f) => cleanFileStem(f.name).toLowerCase());
  const firstWords = stems.map((s) => s.split(/[\s—–\-:]+/)[0]).filter(Boolean);
  const sharedFirst = firstWords.filter((w) => w === firstWords[0]).length;
  const hasPartNumbering = stems.some((s) =>
    /(?:part|chapter|vol|section|appendix|notes)\s*\d*/i.test(s)
  );
  if (sharedFirst === files.length && hasPartNumbering) {
    return 'auto-collect';
  }
  return 'ask';
}

const CHAPTER_HEADING_RE =
  /^(?:#{1,2}\s+.+|(?:chapter|part|section|book|letter|essay|act|scene)\s+(?:[ivxlcdm]+|\d+|[a-z]+)(?:\s*[:.\-—–]\s*.*)?)$/i;

const SCENE_BREAK_RE = /^(?:\*{3,}|-{3,}|_{3,}|~\s*~\s*~|\*\s+\*\s+\*)$/;

export function stripPipelineMetadata(raw: string): string {
  // Strip ---META--- ... ---BODY--- (case-insensitive)
  let text = raw.replace(/^[\s\r\n]*---META---[\s\S]*?---BODY---[\s\r\n]*/i, '');
  // Strip YAML frontmatter --- ... ---
  text = text.replace(/^[\s\r\n]*---[\s\S]*?\n---[\s\r\n]*/, '');
  return text.trim();
}

export function parseTextIntoBlocksAndSections(
  rawText: string,
  fallbackTitle: string,
  sectionOffset = 0,
  sourceMeta?: { fileName?: string; sourceDate?: string; isTechnical?: boolean }
): {
  detectedTitle: string;
  detectedAuthor?: string;
  sections: BookSection[];
  blocks: BookBlock[];
} {
  const cleaned = stripPipelineMetadata(rawText);
  const normalized = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  const lines = normalized.split('\n');

  let detectedTitle = fallbackTitle;
  let detectedAuthor: string | undefined;
  let startLine = 0;

  // Check first few lines for Markdown H1/H2, chapter heading, or Author line
  for (let i = 0; i < Math.min(8, lines.length); i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith('# ') && detectedTitle === fallbackTitle) {
      detectedTitle = line.replace(/^#\s+/, '').trim();
      startLine = i + 1;
    } else if (/^(?:by|author:)\s+/i.test(line) && !detectedAuthor) {
      detectedAuthor = line.replace(/^(?:by|author:)\s+/i, '').trim();
      startLine = Math.max(startLine, i + 1);
    } else if (
      CHAPTER_HEADING_RE.test(line) &&
      line.length < 240 &&
      detectedTitle === fallbackTitle
    ) {
      detectedTitle = line.replace(/^#{1,3}\s+/, '').trim();
      startLine = i + 1;
    } else {
      break;
    }
  }

  const blocks: BookBlock[] = [];
  const sections: BookSection[] = [];
  let currentSectionIndex = sectionOffset;
  let idCounter = 0;
  const nextId = () => `b-${sectionOffset}-${++idCounter}`;

  let inCodeBlock = false;
  let codeLines: string[] = [];
  let paraLines: string[] = [];
  let nextParaGetsDropCap = false;

  const ensureSection = (title: string) => {
    if (sections.length === 0) {
      sections.push({
        index: currentSectionIndex,
        title,
        sourceFile: sourceMeta?.fileName,
        sourceDate: sourceMeta?.sourceDate,
        startBlockIndex: blocks.length,
      });
    }
  };

  const flushParagraph = () => {
    if (paraLines.length === 0) return;
    const text = paraLines.join(' ').replace(/\s+/g, ' ').trim();
    paraLines = [];
    if (!text) return;

    ensureSection(detectedTitle);
    const isQuote = text.startsWith('> ');
    const cleanText = isQuote ? text.replace(/^>\s*/, '') : text;
    blocks.push({
      id: nextId(),
      kind: isQuote ? 'quote' : 'paragraph',
      text: cleanText,
      sectionIndex: currentSectionIndex,
      dropCap: !isQuote && nextParaGetsDropCap && cleanText.length > 60 && !sourceMeta?.isTechnical,
      technical: sourceMeta?.isTechnical,
    });
    nextParaGetsDropCap = false;
  };

  if (sourceMeta?.fileName && sectionOffset > 0) {
    sections.push({
      index: currentSectionIndex,
      title: detectedTitle,
      sourceFile: sourceMeta.fileName,
      sourceDate: sourceMeta.sourceDate,
      startBlockIndex: blocks.length,
    });
    blocks.push({
      id: nextId(),
      kind: 'chapter-title',
      text: detectedTitle,
      sectionIndex: currentSectionIndex,
    });
    if (sourceMeta.fileName) {
      blocks.push({
        id: nextId(),
        kind: 'source-note',
        text: `From ${sourceMeta.fileName}${sourceMeta.sourceDate ? ` · ${sourceMeta.sourceDate}` : ''}`,
        sectionIndex: currentSectionIndex,
      });
    }
    nextParaGetsDropCap = true;
  }

  for (let i = startLine; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (trimmed.startsWith('```')) {
      flushParagraph();
      if (inCodeBlock) {
        blocks.push({
          id: nextId(),
          kind: 'code',
          text: codeLines.join('\n'),
          sectionIndex: currentSectionIndex,
          technical: true,
        });
        codeLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(raw);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      continue;
    }

    if (SCENE_BREAK_RE.test(trimmed)) {
      flushParagraph();
      ensureSection(detectedTitle);
      blocks.push({
        id: nextId(),
        kind: 'scene-break',
        text: '❦',
        sectionIndex: currentSectionIndex,
      });
      continue;
    }

    const isMdH2 = /^##\s+/.test(trimmed);
    const isMdH3 = /^###\s+/.test(trimmed);
    const isChapter = isMdH2 || (CHAPTER_HEADING_RE.test(trimmed) && trimmed.length < 240);

    if (isChapter) {
      flushParagraph();
      const headingText = trimmed.replace(/^#{1,3}\s+/, '').trim();
      if (sections.length > 0) {
        currentSectionIndex += 1;
      }
      sections.push({
        index: currentSectionIndex,
        title: headingText,
        sourceFile: sourceMeta?.fileName,
        sourceDate: sourceMeta?.sourceDate,
        startBlockIndex: blocks.length,
      });
      blocks.push({
        id: nextId(),
        kind: 'chapter-title',
        text: headingText,
        sectionIndex: currentSectionIndex,
      });
      nextParaGetsDropCap = true;
      continue;
    }

    if (isMdH3) {
      flushParagraph();
      ensureSection(detectedTitle);
      blocks.push({
        id: nextId(),
        kind: 'heading',
        text: trimmed.replace(/^###\s+/, '').trim(),
        sectionIndex: currentSectionIndex,
        technical: sourceMeta?.isTechnical,
      });
      continue;
    }

    paraLines.push(trimmed);
  }

  flushParagraph();

  if (codeLines.length > 0) {
    blocks.push({
      id: nextId(),
      kind: 'code',
      text: codeLines.join('\n'),
      sectionIndex: currentSectionIndex,
      technical: true,
    });
  }

  if (sections.length === 0) {
    sections.push({
      index: currentSectionIndex,
      title: detectedTitle,
      sourceFile: sourceMeta?.fileName,
      sourceDate: sourceMeta?.sourceDate,
      startBlockIndex: 0,
    });
  }

  return { detectedTitle, detectedAuthor, sections, blocks };
}

export function buildVolumeFromDocs(
  docs: ParsedSourceDoc[],
  customTitle?: string
): BookVolume {
  const ordered = sortRelatedFiles(
    docs.map((d) => ({ ...d, name: d.fileName }))
  );
  const isCollection = ordered.length > 1;

  const allSections: BookSection[] = [];
  const allBlocks: BookBlock[] = [];
  let title = customTitle || '';
  let author: string | undefined;
  let ocrNote: string | undefined;

  if (!isCollection) {
    const doc = ordered[0];
    const parsed = parseTextIntoBlocksAndSections(doc.text, doc.title, 0, {
      fileName: doc.fileName,
      sourceDate: doc.meta.lastModified
        ? formatShortDate(doc.meta.lastModified)
        : undefined,
      isTechnical: doc.isTechnical,
    });
    title = customTitle || parsed.detectedTitle || doc.title;
    author = doc.author || parsed.detectedAuthor;
    ocrNote = doc.ocrNote;
    allSections.push(...parsed.sections);
    allBlocks.push(...parsed.blocks);
  } else {
    title = customTitle || deriveCollectionTitle(ordered.map((d) => d.fileName));
    let sectionCursor = 0;
    for (const doc of ordered) {
      const sourceDate = doc.meta.lastModified
        ? formatShortDate(doc.meta.lastModified)
        : undefined;
      const parsed = parseTextIntoBlocksAndSections(doc.text, doc.title, sectionCursor, {
        fileName: doc.fileName,
        sourceDate,
        isTechnical: doc.isTechnical,
      });
      if (!author && (doc.author || parsed.detectedAuthor)) {
        author = doc.author || parsed.detectedAuthor;
      }
      if (!ocrNote && doc.ocrNote) {
        ocrNote = doc.ocrNote;
      }

      // If this was the first doc (sectionCursor === 0), ensure a clean chapter opener block exists
      if (sectionCursor === 0) {
        const firstSectionTitle = parsed.detectedTitle || doc.title;
        const firstHasOpener = parsed.blocks[0]?.kind === 'chapter-title';
        if (!firstHasOpener) {
          parsed.blocks.unshift(
            {
              id: `col-opener-${sectionCursor}`,
              kind: 'chapter-title',
              text: firstSectionTitle,
              sectionIndex: 0,
            },
            {
              id: `col-source-${sectionCursor}`,
              kind: 'source-note',
              text: `From ${doc.fileName}${sourceDate ? ` · ${sourceDate}` : ''}`,
              sectionIndex: 0,
            }
          );
          if (parsed.sections.length > 0) {
            parsed.sections[0].title = firstSectionTitle;
            parsed.sections[0].startBlockIndex = 0;
          }
        }
      }

      const baseBlockIdx = allBlocks.length;
      for (const s of parsed.sections) {
        allSections.push({
          ...s,
          startBlockIndex: s.startBlockIndex + baseBlockIdx,
        });
      }
      allBlocks.push(...parsed.blocks);
      sectionCursor =
        allSections.length > 0 ? allSections[allSections.length - 1].index + 1 : sectionCursor + 1;
    }
  }

  const now = Date.now();
  const id = `vol-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  return {
    id,
    title: title || 'Untitled Volume',
    author,
    isCollection,
    sourceFiles: ordered.map((d) => d.meta),
    sections: allSections,
    blocks: allBlocks,
    identity: generateBookIdentity(title || 'Untitled Volume'),
    createdAt: now,
    lastOpenedAt: now,
    lastPageIndex: 3, // Opens directly to first readable content page (after bookplate, title, TOC)
    dogEaredPages: [],
    notes: [],
    highlights: {},
    wearCount: 0,
    ocrNote,
  };
}

function estimateBlockWeight(block: BookBlock, metrics: LayoutMetrics, pageFormat: PageFormat): number {
  switch (block.kind) {
    case 'chapter-title': {
      const cpl = Math.max(12, Math.floor(metrics.charsPerLine * 0.72));
      const lines = Math.max(1, Math.ceil(block.text.length / cpl));
      return lines * metrics.chapterTitleLinePx + metrics.chapterTitleGapPx;
    }
    case 'source-note':
      return metrics.sourceNotePx;
    case 'heading': {
      const cpl = Math.max(14, Math.floor(metrics.charsPerLine * 0.9));
      const lines = Math.max(1, Math.ceil(block.text.length / cpl));
      return lines * metrics.headingLinePx + metrics.headingGapPx;
    }
    case 'scene-break':
      return metrics.sceneBreakPx;
    case 'code': {
      const lines = block.text.split('\n').length;
      return Math.max(40, lines * metrics.codeLinePx) + metrics.codeGapPx;
    }
    case 'quote': {
      const cpl = Math.max(16, Math.floor(metrics.charsPerLine * 0.92));
      const lines = Math.max(1, Math.ceil(block.text.length / cpl));
      return lines * metrics.quoteLinePx + metrics.quoteGapPx;
    }
    case 'paragraph': {
      const cpl = Math.max(18, metrics.charsPerLine);
      const lines = Math.max(1, Math.ceil(block.text.length / cpl));
      const dropCapExtra = block.dropCap && pageFormat === 'novel' ? metrics.lineHeightPx * 0.7 : 0;
      return lines * metrics.lineHeightPx + metrics.paragraphGapPx + dropCapExtra;
    }
  }
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Splits overly long paragraphs cleanly at sentence boundaries so pages never clip.
 * Uses layout metrics to keep chunks within a safe fraction of page content height.
 */
function normalizeBlocksForCapacity(
  blocks: BookBlock[],
  metrics: LayoutMetrics,
  pageFormat: PageFormat
): BookBlock[] {
  const out: BookBlock[] = [];
  const maxHeight = metrics.contentHeightPx * 0.88;
  const cpl = Math.max(18, metrics.charsPerLine);
  const maxChars = Math.max(220, Math.floor((maxHeight / metrics.lineHeightPx) * cpl));

  for (const b of blocks) {
    if (b.kind !== 'paragraph' || b.text.length <= maxChars) {
      out.push(b);
      continue;
    }
    const sentences = b.text.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [b.text];
    let chunk = '';
    let partIdx = 0;
    for (const sentence of sentences) {
      if (chunk.length + sentence.length > maxChars && chunk.trim().length > 0) {
        out.push({
          ...b,
          id: partIdx === 0 ? b.id : `${b.id}-p${partIdx}`,
          text: chunk.trim(),
          dropCap: partIdx === 0 ? b.dropCap : false,
        });
        chunk = sentence;
        partIdx += 1;
      } else {
        chunk += sentence;
      }
    }
    if (chunk.trim()) {
      out.push({
        ...b,
        id: partIdx === 0 ? b.id : `${b.id}-p${partIdx}`,
        text: chunk.trim(),
        dropCap: partIdx === 0 ? b.dropCap : false,
      });
    }
  }
  return out;
}

export function paginateBook(volume: BookVolume, config: PaginationConfig): PaginatedPage[] {
  const pageFormat: PageFormat = config.pageFormat || 'notebook';
  const metrics = getLayoutMetrics(config);
  const capacity = metrics.contentHeightPx;

  const pages: PaginatedPage[] = [];

  // Front Matter:
  // Page 0 (left of first spread): Inside Front Cover / Bookplate
  pages.push({
    index: 0,
    displayNumber: null,
    kind: 'front-bookplate',
    wordCount: 0,
  });

  // Page 1 (right of first spread): Title Page
  pages.push({
    index: 1,
    displayNumber: null,
    kind: 'title-page',
    wordCount: 0,
  });

  // Page 2 (left of second spread): Handwritten Table of Contents (filled after paginating body)
  const tocPageIndex = 2;
  pages.push({
    index: tocPageIndex,
    displayNumber: null,
    kind: 'toc',
    tocEntries: [],
    wordCount: 0,
  });

  const normalizedBlocks = normalizeBlocksForCapacity(volume.blocks, metrics, pageFormat);
  const sectionStartPages = new Map<number, number>();
  const sectionTitleByIndex = new Map<number, string>();
  for (const s of volume.sections) {
    sectionTitleByIndex.set(s.index, s.title);
  }

  let currentBlocks: BookBlock[] = [];
  let currentWeight = 0;
  let currentSectionIdx = normalizedBlocks[0]?.sectionIndex ?? 0;
  let arabicPage = 1;

  const commitPage = () => {
    if (currentBlocks.length === 0) return;
    const words = currentBlocks.reduce((acc, b) => acc + countWords(b.text), 0);
    pages.push({
      index: pages.length,
      displayNumber: arabicPage,
      kind: 'content',
      sectionIndex: currentSectionIdx,
      sectionTitle: sectionTitleByIndex.get(currentSectionIdx),
      blocks: currentBlocks,
      wordCount: words,
    });
    arabicPage += 1;
    currentBlocks = [];
    currentWeight = 0;
  };

  for (let i = 0; i < normalizedBlocks.length; i++) {
    const block = normalizedBlocks[i];
    const weight = estimateBlockWeight(block, metrics, pageFormat);

    // Chapter openers:
    // - Novel format starts each chapter on a fresh right-hand recto page (inserting blank verso when needed)
    // - Collections start each file chapter on a fresh page
    // - Notebook format flows continuously onto a fresh page when past threshold without wasting blank verso sheets!
    if (block.kind === 'chapter-title' && currentBlocks.length > 0) {
      if (pageFormat === 'novel' || volume.isCollection) {
        commitPage();
        if (pageFormat === 'novel' && pages.length % 2 === 0) {
          pages.push({
            index: pages.length,
            displayNumber: null,
            kind: 'blank-verso',
            sectionIndex: currentSectionIdx,
            wordCount: 0,
          });
        }
      } else if (currentWeight > capacity * 0.42) {
        commitPage();
      }
    }

    // Avoid orphan heading at the bottom of a page
    if (
      (block.kind === 'heading' || block.kind === 'chapter-title') &&
      currentBlocks.length > 0 &&
      currentWeight + weight + metrics.lineHeightPx * 3.5 > capacity
    ) {
      commitPage();
    } else if (currentBlocks.length > 0 && currentWeight + weight > capacity) {
      // Natural Paragraph Flow across page boundary:
      // If this is a prose paragraph with multiple sentences and the remaining page space
      // can hold at least ~3 lines, split at a sentence boundary so the bottom of this page
      // is filled cleanly, and the remainder begins on the next page.
      const remainingCapacity = capacity - currentWeight;
      let didSplit = false;

      if (block.kind === 'paragraph' && remainingCapacity >= metrics.lineHeightPx * 3.2) {
        const sentences = block.text.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [block.text];
        if (sentences.length > 1) {
          const headSentences: string[] = [];
          let headWeight = 0;
          for (let sIdx = 0; sIdx < sentences.length; sIdx++) {
            const s = sentences[sIdx];
            const sWeight = estimateBlockWeight({ ...block, text: s }, metrics, pageFormat);
            if (currentWeight + headWeight + sWeight <= capacity) {
              headSentences.push(s);
              headWeight += sWeight;
            } else {
              break;
            }
          }

          const tailSentences = sentences.slice(headSentences.length);
          // Only split if both head and tail have substantial content (avoid widows / orphans)
          if (headSentences.length > 0 && tailSentences.length > 0) {
            const headText = headSentences.join(' ').trim();
            const tailText = tailSentences.join(' ').trim();
            if (headText.length >= 45 && tailText.length >= 35) {
              const headBlock: BookBlock = {
                ...block,
                id: `${block.id}-p1`,
                text: headText,
              };
              currentBlocks.push(headBlock);
              currentWeight += estimateBlockWeight(headBlock, metrics, pageFormat);
              commitPage();

              // Tail block continues at top of the next page
              currentSectionIdx = block.sectionIndex;
              const tailBlock: BookBlock = {
                ...block,
                id: `${block.id}-p2`,
                text: tailText,
                dropCap: false,
              };
              currentBlocks.push(tailBlock);
              currentWeight = estimateBlockWeight(tailBlock, metrics, pageFormat);
              didSplit = true;
              continue;
            }
          }
        }
      }

      if (!didSplit) {
        commitPage();
      }
    }

    if (currentBlocks.length === 0) {
      currentSectionIdx = block.sectionIndex;
    }
    if (!sectionStartPages.has(block.sectionIndex)) {
      sectionStartPages.set(block.sectionIndex, arabicPage);
    }

    currentBlocks.push(block);
    currentWeight += weight;
  }

  commitPage();

  // Populate TOC entries with accurate arabic page numbers
  const tocEntries: TocEntry[] = volume.sections.map((s) => ({
    sectionIndex: s.index,
    title: s.title,
    pageNumber: sectionStartPages.get(s.index) ?? 1,
    sourceFile: s.sourceFile,
  }));
  pages[tocPageIndex].tocEntries = tocEntries;

  // Final Endpaper ("Finished on ...")
  pages.push({
    index: pages.length,
    displayNumber: null,
    kind: 'endpaper',
    wordCount: 0,
  });

  return pages;
}


export function getFirstReadablePageIndex(pages: PaginatedPage[]): number {
  const firstContent = pages.find((p) => p.kind === 'content');
  return firstContent ? firstContent.index : 0;
}

export function clampSpreadStart(
  pageIndex: number,
  totalPages: number,
  pageMode: PageMode
): number {
  const clamped = Math.max(0, Math.min(pageIndex, Math.max(0, totalPages - 1)));
  if (pageMode === 'single') return clamped;
  // In two-page mode, spreads start on even page indices: [0,1], [2,3], [4,5]...
  return clamped % 2 === 0 ? clamped : clamped - 1;
}

export function findPageIndexByDisplayNumber(
  pages: PaginatedPage[],
  displayNumber: number
): number {
  const found = pages.find((p) => p.displayNumber === displayNumber);
  return found ? found.index : getFirstReadablePageIndex(pages);
}

export function searchBook(pages: PaginatedPage[], rawQuery: string): SearchResult[] {
  const query = rawQuery.trim().toLowerCase();
  if (query.length < 2) return [];

  const results: SearchResult[] = [];
  for (const page of pages) {
    if (page.kind !== 'content' || !page.blocks || page.displayNumber === null) continue;
    for (const block of page.blocks) {
      const lower = block.text.toLowerCase();
      const idx = lower.indexOf(query);
      if (idx === -1) continue;

      const start = Math.max(0, idx - 26);
      const end = Math.min(block.text.length, idx + query.length + 34);
      const prefix = start > 0 ? '…' : '';
      const suffix = end < block.text.length ? '…' : '';
      const snippet = `${prefix}${block.text.slice(start, end).trim()}${suffix}`;

      results.push({
        pageIndex: page.index,
        displayNumber: page.displayNumber,
        blockId: block.id,
        snippet,
        matchText: block.text.slice(idx, idx + query.length),
      });

      if (results.length >= 24) return results;
    }
  }
  return results;
}

export interface ReadingProgressEstimate {
  currentDisplayPage: number;
  totalDisplayPages: number;
  minutesLeftInSection: number;
  leftStackRatio: number;
  rightStackRatio: number;
  sectionTitle?: string;
}

export function estimateReadingProgress(
  pages: PaginatedPage[],
  currentPageIndex: number
): ReadingProgressEstimate {
  const contentPages = pages.filter((p) => p.kind === 'content' && p.displayNumber !== null);
  const totalDisplayPages = contentPages.length || 1;
  const clampedIdx = Math.max(0, Math.min(currentPageIndex, pages.length - 1));
  const activePage = pages[clampedIdx];

  let currentDisplayPage = 1;
  if (activePage?.displayNumber !== null && activePage?.displayNumber !== undefined) {
    currentDisplayPage = activePage.displayNumber;
  } else if (clampedIdx >= pages.length - 1) {
    currentDisplayPage = totalDisplayPages;
  }

  // Words remaining in current section from active page onward
  const sectionIdx = activePage?.sectionIndex;
  let remainingWords = 0;
  for (let i = clampedIdx; i < pages.length; i++) {
    const p = pages[i];
    if (p.kind !== 'content') continue;
    if (sectionIdx !== undefined && p.sectionIndex !== sectionIdx) break;
    remainingWords += p.wordCount;
  }
  const minutesLeftInSection = Math.max(1, Math.round(remainingWords / 210));

  const ratio = pages.length > 1 ? clampedIdx / (pages.length - 1) : 0;
  return {
    currentDisplayPage,
    totalDisplayPages,
    minutesLeftInSection,
    leftStackRatio: Math.max(0.06, Math.min(0.94, ratio)),
    rightStackRatio: Math.max(0.06, Math.min(0.94, 1 - ratio)),
    sectionTitle: activePage?.sectionTitle,
  };
}

export function formatShortDate(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
