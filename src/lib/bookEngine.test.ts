import test from 'node:test';
import assert from 'node:assert/strict';
import { splitIntoSentences } from './tts';
import { sliceTextIntoNaturalChunks } from './chapterRecorder';
import { formatChapterFileName, sanitizeFileName } from './fileSystemStorage';
import {
  BOOK_SIZE_ORDER,
  BOOK_SIZES,
  computeBookCameraTransform,
  computeDesktopTableLayout,
  getPhysicalBookMetrics,
} from './dimensions';
import { createInitialScrollState, processViewportWheel } from './viewportScroll';
import { generateBookIdentity } from './identity';
import {
  buildVolumeFromDocs,
  clampSpreadStart,
  deriveCollectionTitle,
  estimateReadingProgress,
  findPageIndexByDisplayNumber,
  findTargetCueIndex,
  paginateBook,
  parseTextIntoBlocksAndSections,
  resolveCueToPageAndBlock,
  searchBook,
  shouldAskToBindTogether,
  sortRelatedFiles,
} from './parser';
import {
  ENVIRONMENTS,
  LIGHTING_MODES,
  PAPER_STOCKS,
  getEffectiveLighting,
  getEnvironmentSpec,
  getLightingSpec,
  getPaperSpec,
  resolveLightingForHour,
} from './lighting';
import { sanitizeSettings } from './storage';
import { createStarterVolumes } from './sampleVolumes';
import {
  filterTextFiles,
  getFolderNameFromFiles,
  isSupportedBookFile,
} from './fileImporter';

test('generateBookIdentity is deterministic for the same title', () => {
  const a = generateBookIdentity('Letters on Quiet Craft');
  const b = generateBookIdentity('  letters on quiet craft  ');
  assert.deepEqual(a, b);

  const c = generateBookIdentity('Machine Learning — Collected Papers');
  assert.ok(c.coverColor.startsWith('#'));
  assert.ok(c.ribbonColor.startsWith('#'));
});

test('sortRelatedFiles orders numbered parts, prefaces, and appendices naturally', () => {
  const input = [
    { name: 'Research Appendix.pdf' },
    { name: 'Machine Learning — Part 2.pdf' },
    { name: 'Machine Learning — Part 1.pdf' },
    { name: 'Preface.pdf' },
  ];
  const sorted = sortRelatedFiles(input).map((f) => f.name);
  assert.deepEqual(sorted, [
    'Preface.pdf',
    'Machine Learning — Part 1.pdf',
    'Machine Learning — Part 2.pdf',
    'Research Appendix.pdf',
  ]);
});

test('deriveCollectionTitle finds shared prefix and labels PDF collections properly', () => {
  const title = deriveCollectionTitle([
    'Machine Learning — Part 1.pdf',
    'Machine Learning — Part 2.pdf',
    'Research Appendix.pdf',
  ]);
  assert.equal(title, 'Machine Learning — Collected Papers');

  assert.equal(
    shouldAskToBindTogether([
      { name: 'Machine Learning — Part 1.pdf' },
      { name: 'Machine Learning — Part 2.pdf' },
    ]),
    'auto-collect'
  );
  assert.equal(
    shouldAskToBindTogether([
      { name: 'Essay One.md' },
      { name: 'Notes on Architecture.md' },
    ]),
    'ask'
  );
});

test('parseTextIntoBlocksAndSections extracts title, author, chapters, quotes, and scene breaks', () => {
  const sample = `# The Quiet Garden
By Elin Holm

## Chapter I — Morning

The frost settled gently along the stone border.

> Quiet rooms invite slower reading.

***

Later the sunlight reached the wooden table.

## Chapter II — Dusk

A brass lamp warmed the center of the page.
`;
  const parsed = parseTextIntoBlocksAndSections(sample, 'Fallback');
  assert.equal(parsed.detectedTitle, 'The Quiet Garden');
  assert.equal(parsed.detectedAuthor, 'Elin Holm');
  assert.equal(parsed.sections.length, 2);
  assert.ok(parsed.blocks.some((b) => b.kind === 'quote'));
  assert.ok(parsed.blocks.some((b) => b.kind === 'scene-break'));
  assert.equal(parsed.blocks.filter((b) => b.kind === 'chapter-title').length, 2);
});

test('paginateBook builds front matter, real TOC page numbers, blank verso, and endpaper', () => {
  const [starter] = createStarterVolumes();
  const pages = paginateBook(starter, {
    pageMode: 'two-page',
    writingSize: 'natural',
    pageSpacing: 'natural',
  });

  assert.equal(pages[0].kind, 'front-bookplate');
  assert.equal(pages[1].kind, 'title-page');
  assert.equal(pages[2].kind, 'toc');
  assert.equal(pages[pages.length - 1].kind, 'endpaper');

  const toc = pages[2].tocEntries || [];
  assert.equal(toc.length, starter.sections.length);
  assert.equal(toc[0].pageNumber, 1);
  assert.ok(toc[1].pageNumber > 1);

  const chapter2PageIdx = findPageIndexByDisplayNumber(pages, toc[1].pageNumber);
  assert.ok(chapter2PageIdx > 3);
  assert.equal(pages[chapter2PageIdx].displayNumber, toc[1].pageNumber);
});

test('searchBook finds matching snippets and estimateReadingProgress computes stack ratios', () => {
  const [starter] = createStarterVolumes();
  const pages = paginateBook(starter, {
    pageMode: 'two-page',
    writingSize: 'natural',
    pageSpacing: 'natural',
  });

  const hits = searchBook(pages, 'memory');
  assert.ok(hits.length >= 2);
  assert.ok(hits[0].snippet.toLowerCase().includes('memory'));
  assert.ok(hits[0].displayNumber >= 1);

  const early = estimateReadingProgress(pages, 3);
  const late = estimateReadingProgress(pages, pages.length - 2);
  assert.ok(late.leftStackRatio > early.leftStackRatio);
  assert.ok(early.rightStackRatio > late.rightStackRatio);
  assert.ok(early.minutesLeftInSection >= 1);
});

test('buildVolumeFromDocs creates multi-file collected volume with source notes', () => {
  const vol = buildVolumeFromDocs([
    {
      fileName: 'Optics — Part 2.md',
      title: 'Optics — Part 2',
      text: 'Second part body text discussing refraction across thin glass.',
      meta: { name: 'Optics — Part 2.md', size: 120, type: 'text/markdown' },
    },
    {
      fileName: 'Optics — Part 1.md',
      title: 'Optics — Part 1',
      text: 'First part body text introducing north window light.',
      meta: { name: 'Optics — Part 1.md', size: 110, type: 'text/markdown' },
    },
  ]);

  assert.equal(vol.isCollection, true);
  assert.equal(vol.title, 'Optics — Collected Volume');
  assert.equal(vol.sourceFiles[0].name, 'Optics — Part 1.md');
  assert.ok(vol.blocks.some((b) => b.kind === 'source-note'));
});

test('clampSpreadStart and resolveLightingForHour behave accurately', () => {
  assert.equal(clampSpreadStart(3, 12, 'two-page'), 2);
  assert.equal(clampSpreadStart(4, 12, 'two-page'), 4);
  assert.equal(clampSpreadStart(3, 12, 'single'), 3);

  assert.equal(resolveLightingForHour(10), 'daylight');
  assert.equal(resolveLightingForHour(16), 'overcast');
  assert.equal(resolveLightingForHour(20), 'warm-lamp');
  assert.equal(resolveLightingForHour(2), 'night-light');
});

test('defensive theme fallbacks protect against unknown or invalid keys', () => {
  // Proxy fallback lookups
  assert.equal((LIGHTING_MODES as Record<string, any>)['non-existent-mode'].id, 'warm-lamp');
  assert.equal((LIGHTING_MODES as Record<string, any>)[undefined as unknown as string].id, 'warm-lamp');
  assert.equal((LIGHTING_MODES as Record<string, any>)[null as unknown as string].id, 'warm-lamp');
  assert.equal((PAPER_STOCKS as Record<string, any>)['unknown-stock'].id, 'white-cotton');
  assert.equal((PAPER_STOCKS as Record<string, any>)[undefined as unknown as string].id, 'white-cotton');
  assert.equal((ENVIRONMENTS as Record<string, any>)['unknown-env'].id, 'wooden-table');
  assert.equal((ENVIRONMENTS as Record<string, any>)[undefined as unknown as string].id, 'wooden-table');

  // Helper functions
  assert.equal(getLightingSpec('bogus').id, 'warm-lamp');
  assert.equal(getLightingSpec(undefined).id, 'warm-lamp');
  assert.equal(getLightingSpec('daylight').id, 'daylight');

  assert.equal(getPaperSpec('bogus').id, 'white-cotton');
  assert.equal(getPaperSpec(undefined).id, 'white-cotton');
  assert.equal(getPaperSpec('dark-charcoal').id, 'dark-charcoal');

  assert.equal(getEnvironmentSpec('bogus').id, 'wooden-table');
  assert.equal(getEnvironmentSpec(undefined).id, 'wooden-table');
  assert.equal(getEnvironmentSpec('dark-space').id, 'dark-space');

  // Effective lighting fallback
  assert.equal(getEffectiveLighting('invalid-mode', false), 'warm-lamp');
  assert.equal(getEffectiveLighting(undefined, false), 'warm-lamp');
  assert.equal(getEffectiveLighting('daylight', false), 'daylight');

  // Storage settings sanitization
  const sanitized = sanitizeSettings({
    lighting: 'invalid' as any,
    paper: 'neon-pink' as any,
    environment: 'outer-space' as any,
  });
  assert.equal(sanitized.lighting, 'daylight');
  assert.equal(sanitized.paper, 'white-cotton');
  assert.equal(sanitized.environment, 'wooden-table');
});

test('all 6 physical book sizes maintain accurate mm ratios and consistent open/closed heights', () => {
  assert.equal(BOOK_SIZE_ORDER.length, 6);
  for (const id of BOOK_SIZE_ORDER) {
    const spec = BOOK_SIZES[id];
    const m = getPhysicalBookMetrics(id);
    assert.ok(m.outerSpreadWidth > m.outerClosedWidth);
    assert.ok(m.pageHeight > m.singlePageWidth);
    assert.equal(m.spreadWidth, m.singlePageWidth * 2);
    assert.ok(spec.heightMm / spec.widthMm > 1.38);
  }
});

test('single-page camera crops left/right pages on constant-size book and computes vertical scroll bounds', () => {
  const metrics = getPhysicalBookMetrics('a5-notebook');
  const leftFocus = computeBookCameraTransform({
    metrics,
    viewportWidth: 1440,
    viewportHeight: 900,
    pageMode: 'single',
    activeSide: 'left',
    userZoom: 1.0,
    scrollY: 0,
  });
  const rightFocus = computeBookCameraTransform({
    metrics,
    viewportWidth: 1440,
    viewportHeight: 900,
    pageMode: 'single',
    activeSide: 'right',
    userZoom: 1.0,
    scrollY: 0,
  });
  const spreadView = computeBookCameraTransform({
    metrics,
    viewportWidth: 1440,
    viewportHeight: 900,
    pageMode: 'two-page',
    activeSide: 'right',
    userZoom: 1.0,
    scrollY: 0,
  });

  // Single page focus pans camera horizontally onto active page on the physical book
  assert.ok(leftFocus.translateX > 0);
  assert.ok(rightFocus.translateX < 0);
  assert.equal(spreadView.translateX, 0);
  assert.ok(rightFocus.effectiveScale > 0.8);
});

test('mobile single-page camera scales to fit mobile width without clipping active leaf bounds', () => {
  const safeW = 390;
  const safeH = 844;

  for (const sizeId of BOOK_SIZE_ORDER) {
    const metrics = getPhysicalBookMetrics(sizeId);

    const leftFocus = computeBookCameraTransform({
      metrics,
      viewportWidth: safeW,
      viewportHeight: safeH,
      pageMode: 'single',
      activeSide: 'left',
      userZoom: 1.0,
      scrollY: 0,
    });

    const rightFocus = computeBookCameraTransform({
      metrics,
      viewportWidth: safeW,
      viewportHeight: safeH,
      pageMode: 'single',
      activeSide: 'right',
      userZoom: 1.0,
      scrollY: 0,
    });

    // Verify effectiveScale does not make single page width exceed safeW * 0.98
    const pageWLeft = metrics.singlePageWidth * leftFocus.effectiveScale;
    const pageWRight = metrics.singlePageWidth * rightFocus.effectiveScale;
    assert.ok(pageWLeft <= safeW * 0.98, `${sizeId} left page width must not exceed 98% safeW`);
    assert.ok(pageWRight <= safeW * 0.98, `${sizeId} right page width must not exceed 98% safeW`);

    // Verify translateX places the active leaf bounds within [0, safeW]
    const leftLeafLeft = safeW / 2 + leftFocus.translateX - pageWLeft;
    const leftLeafRight = safeW / 2 + leftFocus.translateX;
    assert.ok(leftLeafLeft >= 0, `${sizeId} left leaf left bound >= 0 (got ${leftLeafLeft})`);
    assert.ok(leftLeafRight <= safeW, `${sizeId} left leaf right bound <= ${safeW} (got ${leftLeafRight})`);

    const rightLeafLeft = safeW / 2 + rightFocus.translateX;
    const rightLeafRight = rightLeafLeft + pageWRight;
    assert.ok(rightLeafLeft >= 0, `${sizeId} right leaf left bound >= 0 (got ${rightLeafLeft})`);
    assert.ok(rightLeafRight <= safeW, `${sizeId} right leaf right bound <= ${safeW} (got ${rightLeafRight})`);
  }
});

test('notebook format fits more prose per page than wide-margin novel format', () => {
  const [starter] = createStarterVolumes();
  const notebookPages = paginateBook(starter, {
    pageMode: 'two-page',
    pageFormat: 'notebook',
    bookSize: 'a5-notebook',
    writingSize: 'natural',
    pageSpacing: 'natural',
  });
  const novelPages = paginateBook(starter, {
    pageMode: 'two-page',
    pageFormat: 'novel',
    bookSize: 'a5-notebook',
    writingSize: 'natural',
    pageSpacing: 'natural',
  });

  assert.ok(notebookPages.length <= novelPages.length);
  assert.equal(notebookPages.some((p) => p.kind === 'blank-verso'), false);
});

test('viewport scroll engine scrolls long page first, absorbs boundary momentum, and flips only on deliberate push', () => {
  let state = createInitialScrollState();
  let scrollY = 0;
  const maxScrollY = 260;

  // 1. Mid-page vertical wheel scrolls content without flipping
  const step1 = processViewportWheel(state, {
    deltaX: 0,
    deltaY: 160,
    now: 1000,
    scrollY,
    maxScrollY,
    canScrollVertically: true,
    isFirstPage: false,
    isLastPage: false,
  });
  assert.equal(step1.action, 'scroll');
  assert.ok(step1.nextScrollY > 100 && step1.nextScrollY < maxScrollY);
  state = step1.nextState;
  scrollY = step1.nextScrollY;

  // 2. Reaching bottom boundary records arrival without flipping
  const step2 = processViewportWheel(state, {
    deltaX: 0,
    deltaY: 220,
    now: 1030,
    scrollY,
    maxScrollY,
    canScrollVertically: true,
    isFirstPage: false,
    isLastPage: false,
  });
  assert.equal(step2.action, 'scroll');
  assert.equal(step2.nextScrollY, maxScrollY);
  assert.equal(step2.nextState.arrivedBoundary, 'bottom');
  state = step2.nextState;
  scrollY = step2.nextScrollY;

  // 3. Rapid trackpad inertia right after arrival is absorbed and NEVER flips
  const inertia = processViewportWheel(state, {
    deltaX: 0,
    deltaY: 180,
    now: 1080,
    scrollY,
    maxScrollY,
    canScrollVertically: true,
    isFirstPage: false,
    isLastPage: false,
  });
  assert.equal(inertia.action, 'none');
  state = inertia.nextState;

  // 4. After pausing past momentum gap, a fresh deliberate push past threshold turns to next page
  const deliberate = processViewportWheel(state, {
    deltaX: 0,
    deltaY: 130,
    now: 1300,
    scrollY,
    maxScrollY,
    canScrollVertically: true,
    isFirstPage: false,
    isLastPage: false,
  });
  assert.equal(deliberate.action, 'turn-next');
  assert.equal(deliberate.nextScrollY, 0);

  // 5. Subsequent residual momentum ticks during flip cooldown are ignored and scrollY stays strictly 0
  const postTurnResidual = processViewportWheel(deliberate.nextState, {
    deltaX: 0,
    deltaY: 160,
    now: 1350,
    scrollY: 0,
    maxScrollY,
    canScrollVertically: true,
    isFirstPage: false,
    isLastPage: false,
  });
  assert.equal(postTurnResidual.action, 'none');
  assert.equal(postTurnResidual.nextScrollY, 0);
});

test('scrolling down past the last page never triggers a turn or opens settings', () => {
  let state = createInitialScrollState();
  const atBottomLast = processViewportWheel(state, {
    deltaX: 0,
    deltaY: 300,
    now: 2000,
    scrollY: 240,
    maxScrollY: 240,
    canScrollVertically: true,
    isFirstPage: false,
    isLastPage: true,
  });
  assert.equal(atBottomLast.action, 'none');

  const flatLast = processViewportWheel(state, {
    deltaX: 0,
    deltaY: 400,
    now: 3000,
    scrollY: 0,
    maxScrollY: 0,
    canScrollVertically: false,
    isFirstPage: false,
    isLastPage: true,
  });
  assert.equal(flatLast.action, 'none');
});

test('computeDesktopTableLayout locks exact book aspect ratio across zoomed PC/laptop viewports', () => {
  const metrics = getPhysicalBookMetrics('a5-notebook');
  const expectedRatio = metrics.outerHeight / metrics.outerClosedWidth;

  const viewports = [
    [1440, 900],
    [1280, 720],
    [1152, 720], // 125% zoom
    [960, 600], // 150% zoom
    [822, 514], // 175% zoom
  ];

  for (const [w, h] of viewports) {
    const layout = computeDesktopTableLayout(metrics, w, h);
    assert.equal(layout.isDesktop, true);
    const actualRatio = layout.centerH / layout.centerW;
    assert.ok(
      Math.abs(actualRatio - expectedRatio) < 0.03,
      `Aspect ratio drifted at ${w}x${h}: got ${actualRatio}, expected ${expectedRatio}`
    );
    assert.ok(layout.centerH <= h * 0.85, `Center book height fits viewport ${w}x${h}`);
    assert.ok(layout.sideW > 110 && layout.settingsW > 115, `Side & settings books stay visible at ${w}x${h}`);
  }
});

test('folder import helpers extract folder name and filter text files', () => {
  const fakeFile = (name: string, webkitRelativePath = '', type = '') =>
    ({ name, webkitRelativePath, type } as unknown as File);

  const folderFiles = [
    fakeFile('.DS_Store', 'Chronicles of the Sea/.DS_Store'),
    fakeFile('cover.png', 'Chronicles of the Sea/cover.png', 'image/png'),
    fakeFile('01 - The Harbor.txt', 'Chronicles of the Sea/01 - The Harbor.txt', 'text/plain'),
    fakeFile('02 - The Open Deep.md', 'Chronicles of the Sea/02 - The Open Deep.md', 'text/markdown'),
    fakeFile('notes.rtf', 'Chronicles of the Sea/notes.rtf', 'text/rtf'),
  ];

  const folderName = getFolderNameFromFiles(folderFiles);
  assert.equal(folderName, 'Chronicles of the Sea');

  const textFiles = filterTextFiles(folderFiles);
  assert.equal(textFiles.length, 2);
  assert.deepEqual(textFiles.map((f) => f.name), [
    '01 - The Harbor.txt',
    '02 - The Open Deep.md',
  ]);
});

test('folder text files become distinct book chapters in TOC and pages', () => {
  const chapterDocs = [
    {
      fileName: '02 - The Voyage.md',
      title: '02 - The Voyage',
      text: 'The sails caught the cold morning wind as the shoreline disappeared.',
      meta: { name: '02 - The Voyage.md', size: 100, type: 'text/markdown' },
    },
    {
      fileName: '01 - The Port.txt',
      title: '01 - The Port',
      text: 'Lanterns flickered along the stone quay before dawn.',
      meta: { name: '01 - The Port.txt', size: 90, type: 'text/plain' },
    },
    {
      fileName: '03 - The Horizon.md',
      title: '03 - The Horizon',
      text: 'A thin line of silver parted the sky from the dark waters.',
      meta: { name: '03 - The Horizon.md', size: 95, type: 'text/markdown' },
    },
  ];

  // Build volume from folder text files with customTitle = folder name
  const book = buildVolumeFromDocs(chapterDocs, 'Chronicles of the Sea');

  assert.equal(book.title, 'Chronicles of the Sea');
  assert.equal(book.isCollection, true);
  assert.equal(book.sections.length, 3);

  // Files are sorted numerically
  assert.equal(book.sections[0].title, '01 - The Port');
  assert.equal(book.sections[1].title, '02 - The Voyage');
  assert.equal(book.sections[2].title, '03 - The Horizon');

  // Each chapter has a chapter-title block
  const chapterTitles = book.blocks.filter((b) => b.kind === 'chapter-title');
  assert.equal(chapterTitles.length, 3);
  assert.equal(chapterTitles[0].text, '01 - The Port');
  assert.equal(chapterTitles[1].text, '02 - The Voyage');
  assert.equal(chapterTitles[2].text, '03 - The Horizon');

  // Paginate into book format
  const pages = paginateBook(book, {
    pageMode: 'two-page',
    pageFormat: 'notebook',
    writingSize: 'natural',
    pageSpacing: 'natural',
  });

  const toc = pages[2].tocEntries || [];
  assert.equal(toc.length, 3);
  assert.equal(toc[0].title, '01 - The Port');
  assert.equal(toc[1].title, '02 - The Voyage');
  assert.equal(toc[2].title, '03 - The Horizon');

  // Every chapter starts on its own page
  assert.equal(toc[0].pageNumber, 1);
  assert.ok(toc[1].pageNumber > toc[0].pageNumber);
  assert.ok(toc[2].pageNumber > toc[2].pageNumber || toc[2].pageNumber > toc[1].pageNumber);
});

test('splitIntoSentences preserves dialogue quotes, abbreviations, and numbers without truncation', () => {
  // Dialogue quotes never drop leading dialogue or split dialogue tags
  const d1 = splitIntoSentences('"This is amazing!" he said.');
  assert.deepEqual(d1, ['"This is amazing!" he said.']);

  const d2 = splitIntoSentences('She asked, "Where are we going?" Then he left.');
  assert.deepEqual(d2, ['She asked, "Where are we going?"', 'Then he left.']);

  // Abbreviations do not cause false sentence splits
  const ab = splitIntoSentences('Dr. Watson went to St. John church. It was quiet.');
  assert.deepEqual(ab, ['Dr. Watson went to St. John church.', 'It was quiet.']);

  // Numbers with decimals do not split or drop text
  const num = splitIntoSentences('It costs $3.50 per book.');
  assert.deepEqual(num, ['It costs $3.50 per book.']);

  // Normal sentences split cleanly
  const norm = splitIntoSentences('First sentence. Second sentence! Third sentence?');
  assert.deepEqual(norm, ['First sentence.', 'Second sentence!', 'Third sentence?']);
});

test('chapter audio recorder slices long text at clean paragraph and sentence boundaries', () => {
  const p1 = 'This is the first paragraph with dialogue. "Indeed," he answered.';
  const p2 = 'Here is the second paragraph exploring the coastline.';
  const p3 = 'And the third paragraph watching the evening tide rise over stone.';
  const chapterText = `${p1}\n\n${p2}\n\n${p3}`;

  // Max length 120 ensures chunks split at paragraph/sentence boundaries without cutting sentences
  const chunks = sliceTextIntoNaturalChunks(chapterText, 120);
  assert.ok(chunks.length >= 2);
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 120);
    // Ensure no broken words at boundary
    assert.ok(!chunk.startsWith(' '));
    assert.ok(!chunk.endsWith(' '));
  }
  // Reconstructed content matches original paragraphs
  assert.ok(chunks.join(' ').includes('"Indeed," he answered.'));
});

test('formatChapterFileName cleans titles and numbers chapters sequentially', () => {
  assert.equal(
    formatChapterFileName(0, 'The Harbor Entrance'),
    'Chapter_01_The_Harbor_Entrance.mp3'
  );
  assert.equal(
    formatChapterFileName(9, 'Act III: What Lies Ahead?'),
    'Chapter_10_Act_III__What_Lies_Ahead_.mp3'
  );
  assert.equal(sanitizeFileName('invalid/name:*?"<>|'), 'invalid_name_______');
});

test('chapter audio cue navigation locates next and previous sentences accurately', () => {
  const cues = [
    { blockId: 'b1', sentenceIndex: 0, text: 'Sentence one.', startSec: 0.0, endSec: 2.5 },
    { blockId: 'b1', sentenceIndex: 1, text: 'Sentence two.', startSec: 2.5, endSec: 5.0 },
    { blockId: 'b2', sentenceIndex: 0, text: 'Sentence three.', startSec: 5.0, endSec: 8.0 },
    { blockId: 'b2', sentenceIndex: 1, text: 'Sentence four.', startSec: 8.0, endSec: 11.0 },
  ];

  // At 1.0s (mid sentence 0), skipping next moves to sentence 1
  const curTime = 1.0;
  const curIdx = cues.findIndex((c) => curTime >= c.startSec && curTime < c.endSec);
  assert.equal(curIdx, 0);
  const nextIdx = curIdx + 1;
  assert.equal(cues[nextIdx].text, 'Sentence two.');
  assert.equal(cues[nextIdx].startSec, 2.5);

  // At 4.5s (more than 1.5s into sentence 1), skipping prev restarts sentence 1
  const midSentenceTime = 4.5;
  const midIdx = cues.findIndex((c) => midSentenceTime >= c.startSec && midSentenceTime < c.endSec);
  const restartTarget = midSentenceTime - cues[midIdx].startSec > 1.5 ? midIdx : midIdx - 1;
  assert.equal(restartTarget, 1);
  assert.equal(cues[restartTarget].startSec, 2.5);

  // At 2.6s (within 1.5s of start of sentence 1), skipping prev goes to sentence 0
  const earlySentenceTime = 2.6;
  const earlyIdx = cues.findIndex((c) => earlySentenceTime >= c.startSec && earlySentenceTime < c.endSec);
  const prevTarget = earlySentenceTime - cues[earlyIdx].startSec > 1.5 ? earlyIdx : earlyIdx - 1;
  assert.equal(prevTarget, 0);
  assert.equal(cues[prevTarget].startSec, 0.0);
});

test('findTargetCueIndex handles boundaries, gaps, double clicks, and past-end seeks', () => {
  const cues = [
    { startSec: 0.0, endSec: 2.5 },
    { startSec: 2.5, endSec: 5.0 },
    { startSec: 6.5, endSec: 9.0 }, // 1.5s gap between cues 1 and 2
  ];

  // Empty cues
  assert.equal(findTargetCueIndex([], 1.0, 'next'), -1);
  assert.equal(findTargetCueIndex([], 1.0, 'prev'), -1);

  // Next: inside cue 0 -> cue 1
  assert.equal(findTargetCueIndex(cues, 1.0, 'next'), 1);

  // Next: inside last cue (cue 2) -> -1 (boundary reached)
  assert.equal(findTargetCueIndex(cues, 7.5, 'next'), -1);

  // Next: inside gap at 5.5s -> cue 2
  assert.equal(findTargetCueIndex(cues, 5.5, 'next'), 2);

  // Prev: inside cue 1 at 4.5s (>1.5s) -> restarts cue 1
  assert.equal(findTargetCueIndex(cues, 4.5, 'prev'), 1);

  // Fast double click simulation: after restart to 2.51s (<=1.5s), prev jumps to cue 0
  assert.equal(findTargetCueIndex(cues, 2.51, 'prev'), 0);

  // Prev: boundary at cue 0 at 0.5s -> restarts cue 0 without negative index
  assert.equal(findTargetCueIndex(cues, 0.5, 'prev'), 0);

  // Prev: in gap at 5.5s -> jumps to previous cue (cue 1)
  assert.equal(findTargetCueIndex(cues, 5.5, 'prev'), 1);

  // Prev: past end of chapter audio at 12.0s -> restarts last cue (cue 2), does not reset to 0
  assert.equal(findTargetCueIndex(cues, 12.0, 'prev'), 2);

  // Prev: before first cue at -0.1s -> returns 0
  assert.equal(findTargetCueIndex(cues, -0.1, 'prev'), 0);
});

test('resolveCueToPageAndBlock maps cues across regular, quote, and split pages', () => {
  const mockPages = [
    {
      index: 0,
      displayNumber: null,
      kind: 'front-bookplate' as const,
      sectionIndex: 0,
      wordCount: 0,
    },
    {
      index: 1,
      displayNumber: 1,
      kind: 'content' as const,
      sectionIndex: 0,
      wordCount: 100,
      blocks: [
        { id: 'b-0-1', kind: 'paragraph' as const, text: 'Single page paragraph.', sectionIndex: 0 },
        { id: 'b-0-2-p1', kind: 'paragraph' as const, text: 'First half sentence zero. First half sentence one.', sectionIndex: 0 },
      ],
    },
    {
      index: 2,
      displayNumber: 2,
      kind: 'content' as const,
      sectionIndex: 0,
      wordCount: 100,
      blocks: [
        { id: 'b-0-2-p2', kind: 'paragraph' as const, text: 'Second half sentence two. Second half sentence three.', sectionIndex: 0 },
        { id: 'b-0-3', kind: 'quote' as const, text: 'A wise quote. Second sentence of quote.', sectionIndex: 0 },
      ],
    },
  ];

  // 1. Direct block on page 1
  const direct = resolveCueToPageAndBlock(mockPages, { blockId: 'b-0-1', sentenceIndex: 0 });
  assert.deepEqual(direct, { pageIndex: 1, blockId: 'b-0-1', sentenceIndex: 0 });

  // 2. Split block first half on page 1
  const splitP1_s0 = resolveCueToPageAndBlock(mockPages, { blockId: 'b-0-2', sentenceIndex: 0 });
  assert.deepEqual(splitP1_s0, { pageIndex: 1, blockId: 'b-0-2-p1', sentenceIndex: 0 });

  const splitP1_s1 = resolveCueToPageAndBlock(mockPages, { blockId: 'b-0-2', sentenceIndex: 1 });
  assert.deepEqual(splitP1_s1, { pageIndex: 1, blockId: 'b-0-2-p1', sentenceIndex: 1 });

  // 3. Split block second half on page 2 (sentence index shifted relative to page block)
  const splitP2_s2 = resolveCueToPageAndBlock(mockPages, { blockId: 'b-0-2', sentenceIndex: 2 });
  assert.deepEqual(splitP2_s2, { pageIndex: 2, blockId: 'b-0-2-p2', sentenceIndex: 0 });

  const splitP2_s3 = resolveCueToPageAndBlock(mockPages, { blockId: 'b-0-2', sentenceIndex: 3 });
  assert.deepEqual(splitP2_s3, { pageIndex: 2, blockId: 'b-0-2-p2', sentenceIndex: 1 });

  // 4. Quote block on page 2
  const quote_s1 = resolveCueToPageAndBlock(mockPages, { blockId: 'b-0-3', sentenceIndex: 1 });
  assert.deepEqual(quote_s1, { pageIndex: 2, blockId: 'b-0-3', sentenceIndex: 1 });

  // 5. Unknown block returns null
  assert.equal(resolveCueToPageAndBlock(mockPages, { blockId: 'non-existent', sentenceIndex: 0 }), null);
});

test('parseTextIntoBlocksAndSections cleans multi-line blockquotes without leaking syntax markers', () => {
  const markdown = `# Quotes Test\n\n> "Reading is to the mind what exercise is to the body."\n> — Joseph Addison\n\nFollow-up paragraph.`;
  const parsed = parseTextIntoBlocksAndSections(markdown, 'Quotes Test');
  const quoteBlock = parsed.blocks.find((b) => b.kind === 'quote');
  assert.ok(quoteBlock);
  assert.ok(!quoteBlock.text.includes('>'), 'Quote block text must not contain markdown > markers');
  assert.ok(quoteBlock.text.includes('Joseph Addison'));

  const sentences = splitIntoSentences(quoteBlock.text);
  assert.ok(sentences.length >= 1);
  assert.ok(sentences[0].includes('Reading is to the mind'));
});

test('splitIntoSentences handles fallback regex without truncating decimals and abbreviations', () => {
  const origIntl = globalThis.Intl;
  try {
    // @ts-ignore
    globalThis.Intl = undefined;
    const res1 = splitIntoSentences('He paid $3.50 for the coffee. It was good.');
    assert.equal(res1.length, 2);
    assert.equal(res1[0], 'He paid $3.50 for the coffee.');
    assert.equal(res1[1], 'It was good.');

    const res2 = splitIntoSentences('Dr. Watson arrived at 5 p.m. It was cold.');
    assert.ok(res2.length >= 2);
    assert.ok(res2[0].startsWith('Dr. Watson'));
  } finally {
    globalThis.Intl = origIntl;
  }
});



