import test from 'node:test';
import assert from 'node:assert/strict';
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
  paginateBook,
  parseTextIntoBlocksAndSections,
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
  assert.ok(toc[2].pageNumber > toc[1].pageNumber);
});
