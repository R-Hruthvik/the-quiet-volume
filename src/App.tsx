import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BindingAnimation } from './components/BindingAnimation';
import {
  ClosedTableView,
  type PendingCollectionPrompt,
} from './components/ClosedTableView';
import { OpenBookView } from './components/OpenBookView';
import { ReadingEnvironment } from './components/ReadingEnvironment';
import { SettingsBookView } from './components/SettingsBookView';
import {
  filterTextFiles,
  getFolderNameFromFiles,
  readDroppedFilesLocally,
} from './lib/fileImporter';
import { getEffectiveLighting } from './lib/lighting';
import {
  buildVolumeFromDocs,
  clampSpreadStart,
  getFirstReadablePageIndex,
  paginateBook,
  shouldAskToBindTogether,
  type ParsedSourceDoc,
} from './lib/parser';
import { createSampleManuscriptDocs, createStarterVolumes } from './lib/sampleVolumes';
import {
  clearAllVolumes,
  loadLastActiveBookId,
  loadSettings,
  loadVolumes,
  removeVolume,
  sanitizeSettings,
  saveLastActiveBookId,
  saveSettings,
  saveVolume,
} from './lib/storage';
import {
  getPersistentAudio,
  pauseSpeaking,
  resumeSpeaking,
  speakSentence,
  splitIntoSentences,
  stopSpeaking,
  syncMediaSessionMetadata,
  unlockAudioOnUserGesture,
} from './lib/tts';
import { getChapterAudioFile } from './lib/fileSystemStorage';
import { recordChapterAudio } from './lib/chapterRecorder';
import type {
  BookIdentity,
  BookVolume,
  HighlightKind,
  ReaderSettings,
} from './types/book';

type AppView = 'table' | 'binding' | 'reading' | 'settings-book';

interface BindingJob {
  volumes: BookVolume[];
  primary: BookVolume;
  fileCount: number;
}

export default function App() {
  const [volumes, setVolumes] = useState<BookVolume[]>([]);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [hasOpenedAnyBook, setHasOpenedAnyBook] = useState(false);
  const [view, setView] = useState<AppView>('table');
  const [settingsReturnView, setSettingsReturnView] = useState<'reading' | 'table'>('table');
  const [settings, setSettings] = useState<ReaderSettings>(() => loadSettings());
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [bindingJob, setBindingJob] = useState<BindingJob | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<PendingCollectionPrompt | null>(null);
  const [focusSearchInSettings, setFocusSearchInSettings] = useState(false);
  const [liveCameraBarOpen, setLiveCameraBarOpen] = useState(false);
  const [resumeBlockId, setResumeBlockId] = useState<string | null>(null);
  const [clockTick, setClockTick] = useState(() => Date.now());
  const [bindNotice, setBindNotice] = useState<string | null>(null);

  // Read-aloud state
  const [isReadingAloud, setIsReadingAloud] = useState(false);
  const [isSpeechPaused, setIsSpeechPaused] = useState(false);
  const [activeSpeechCue, setActiveSpeechCue] = useState<{
    blockId: string;
    sentenceIndex: number;
  } | null>(null);

  const speechSessionRef = useRef(0);
  const queueCursorRef = useRef(0);
  const queueRef = useRef<{ blockId: string; sentenceIndex: number; text: string }[]>([]);
  const currentSpeakNextRef = useRef<(() => void) | null>(null);

  // Load persisted volumes (or seed quiet starter volumes on first visit)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await loadVolumes();
      if (cancelled) return;

      let initialVolumes = stored;
      if (initialVolumes.length === 0) {
        const starters = createStarterVolumes();
        initialVolumes = starters;
        for (const s of starters) {
          await saveVolume(s);
        }
      }

      const savedActiveId = loadLastActiveBookId();
      const matchedActive = initialVolumes.find((v) => v.id === savedActiveId) || null;
      const autostart =
        typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('autostart') === '1';

      setVolumes(initialVolumes);

      if (autostart && initialVolumes.length > 0) {
        const target = matchedActive || initialVolumes[0];
        setActiveBookId(target.id);
        setHasOpenedAnyBook(true);
        setView('reading');
      } else if (matchedActive) {
        setActiveBookId(matchedActive.id);
        setHasOpenedAnyBook(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Gentle minute clock for Auto lighting ("Follow the time outside")
  useEffect(() => {
    if (!settings.autoLighting) return;
    const id = window.setInterval(() => setClockTick(Date.now()), 60000);
    return () => window.clearInterval(id);
  }, [settings.autoLighting]);

  // Persist settings whenever updated
  const updateSettings = useCallback((patch: Partial<ReaderSettings>) => {
    setSettings((prev) => {
      const next = sanitizeSettings({ ...prev, ...patch });
      saveSettings(next);
      return next;
    });
  }, []);

  const activeVolume = useMemo(
    () => volumes.find((v) => v.id === activeBookId) || null,
    [volumes, activeBookId]
  );

  const effectiveLighting = useMemo(
    () => getEffectiveLighting(settings.lighting, settings.autoLighting, new Date(clockTick)),
    [settings.lighting, settings.autoLighting, clockTick]
  );

  const paginationConfig = useMemo(
    () => ({
      pageMode: settings.pageMode,
      pageFormat: settings.pageFormat,
      bookSize: settings.bookSize,
      writingSize: settings.writingSize,
      writingHand: settings.writingHand,
      pageSpacing: settings.pageSpacing,
      fineLineHeight: settings.fineLineHeight,
      fineMarginScale: settings.fineMarginScale,
    }),
    [
      settings.pageMode,
      settings.pageFormat,
      settings.bookSize,
      settings.writingSize,
      settings.writingHand,
      settings.pageSpacing,
      settings.fineLineHeight,
      settings.fineMarginScale,
    ]
  );

  const paginatedPages = useMemo(() => {
    if (!activeVolume) return [];
    return paginateBook(activeVolume, paginationConfig);
  }, [activeVolume, paginationConfig]);

  const persistActiveVolumeUpdate = useCallback(
    (updater: (vol: BookVolume) => BookVolume) => {
      if (!activeBookId) return;
      setVolumes((prev) =>
        prev.map((vol) => {
          if (vol.id !== activeBookId) return vol;
          const updated = updater(vol);
          saveVolume(updated);
          return updated;
        })
      );
    },
    [activeBookId]
  );

  // Stop speech cleanly whenever closing book or leaving reading view
  const stopAllSpeech = useCallback(() => {
    speechSessionRef.current += 1;
    stopSpeaking();
    currentSpeakNextRef.current = null;
    queueCursorRef.current = 0;
    queueRef.current = [];
    setIsReadingAloud(false);
    setIsSpeechPaused(false);
    setActiveSpeechCue(null);
  }, []);

  const openVolume = useCallback(
    (volumeId: string) => {
      const target = volumes.find((v) => v.id === volumeId);
      if (!target) return;
      stopAllSpeech();

      const updated: BookVolume = {
        ...target,
        lastOpenedAt: Date.now(),
        wearCount: target.wearCount + 1,
      };
      setVolumes((prev) => prev.map((v) => (v.id === volumeId ? updated : v)));
      saveVolume(updated);
      saveLastActiveBookId(volumeId);

      setActiveBookId(volumeId);
      setHasOpenedAnyBook(true);
      setFocusSearchInSettings(false);
      setResumeBlockId(updated.lastBlockId || null);
      setView('reading');
    },
    [volumes, stopAllSpeech]
  );

  const openSettingsBook = useCallback(
    (from: 'reading' | 'table', focusSearch = false) => {
      setSettingsReturnView(from);
      setFocusSearchInSettings(focusSearch);
      setLiveCameraBarOpen(false);
      setView('settings-book');
    },
    []
  );

  const closeBook = useCallback(() => {
    stopAllSpeech();
    setFocusSearchInSettings(false);
    setLiveCameraBarOpen(false);
    setView('table');
  }, [stopAllSpeech]);

  const startBindingDocs = useCallback(
    (docs: ParsedSourceDoc[], combineTogether: boolean, customTitle?: string) => {
      if (docs.length === 0) return;
      stopAllSpeech();

      const createdVolumes: BookVolume[] = combineTogether
        ? [buildVolumeFromDocs(docs, customTitle)]
        : docs.map((d) => buildVolumeFromDocs([d]));

      const primary = createdVolumes[0];
      setBindingJob({
        volumes: createdVolumes,
        primary,
        fileCount: docs.length,
      });
      setView('binding');
    },
    [stopAllSpeech]
  );

  const finishBindingAnimation = useCallback(async () => {
    if (!bindingJob) return;
    const { volumes: created, primary } = bindingJob;

    // Position the freshly bound volume at its first readable page
    const pages = paginateBook(primary, paginationConfig);
    const firstReadable = getFirstReadablePageIndex(pages);
    const readyPrimary: BookVolume = {
      ...primary,
      lastPageIndex: firstReadable,
      lastBlockId: pages[firstReadable]?.blocks?.[0]?.id,
    };
    const finalCreated = created.map((v, i) => (i === 0 ? readyPrimary : v));

    for (const v of finalCreated) {
      await saveVolume(v);
    }

    setVolumes((prev) => [...finalCreated, ...prev]);
    setActiveBookId(readyPrimary.id);
    setHasOpenedAnyBook(true);
    saveLastActiveBookId(readyPrimary.id);
    setResumeBlockId(readyPrimary.lastBlockId || null);
    setBindingJob(null);
    setView('reading');
  }, [bindingJob, paginationConfig]);

  const handleIncomingFiles = useCallback(
    async (rawFiles: File[], folderName?: string) => {
      setBindNotice(null);
      const inferredFolderName = folderName || getFolderNameFromFiles(rawFiles);
      const isFolderImport = Boolean(inferredFolderName);

      let filesToProcess = rawFiles;
      if (isFolderImport || rawFiles.length > 1) {
        const textOnly = filterTextFiles(rawFiles);
        if (textOnly.length > 0) {
          filesToProcess = textOnly;
        }
      }

      const docs = await readDroppedFilesLocally(filesToProcess);
      if (docs.length === 0) {
        setBindNotice(
          isFolderImport
            ? 'No readable text files (.txt, .md) found in that folder.'
            : 'Please drop a TXT, Markdown, PDF, EPUB, or ZIP file to bind.'
        );
        window.setTimeout(() => setBindNotice(null), 4000);
        return;
      }

      if (isFolderImport) {
        // Automatically bind all text files in the folder together as chapters of the book
        const bookTitle = inferredFolderName === 'Selected Chapters' ? undefined : inferredFolderName;
        startBindingDocs(docs, true, bookTitle);
        return;
      }

      const mode = shouldAskToBindTogether(docs.map((d) => ({ name: d.fileName })));
      if (mode === 'single') {
        startBindingDocs(docs, true);
      } else if (mode === 'auto-collect') {
        startBindingDocs(docs, true);
      } else {
        setView('table');
        setPendingPrompt({
          fileNames: docs.map((d) => d.fileName),
          onBindTogether: () => {
            setPendingPrompt(null);
            startBindingDocs(docs, true);
          },
          onKeepSeparate: () => {
            setPendingPrompt(null);
            startBindingDocs(docs, false);
          },
          onCancel: () => setPendingPrompt(null),
        });
      }
    },
    [startBindingDocs]
  );

  const handleBindSampleManuscript = useCallback(() => {
    const sampleDocs = createSampleManuscriptDocs();
    // Show the signature loose pencil card so the user can experience choosing Bind together / Keep separate
    setPendingPrompt({
      fileNames: sampleDocs.map((d) => d.fileName),
      onBindTogether: () => {
        setPendingPrompt(null);
        startBindingDocs(sampleDocs, true);
      },
      onKeepSeparate: () => {
        setPendingPrompt(null);
        startBindingDocs(sampleDocs, false);
      },
      onCancel: () => setPendingPrompt(null),
    });
  }, [startBindingDocs]);

  const handleChangePageIndex = useCallback(
    (nextIndex: number) => {
      const clamped = Math.max(0, Math.min(nextIndex, Math.max(0, paginatedPages.length - 1)));
      const targetPage = paginatedPages[clamped];
      const firstBlockId = targetPage?.blocks?.[0]?.id;
      const reachedEndpaper = targetPage?.kind === 'endpaper';

      setResumeBlockId(null);
      persistActiveVolumeUpdate((vol) => ({
        ...vol,
        lastPageIndex: clamped,
        lastBlockId: firstBlockId || vol.lastBlockId,
        finishedAt: reachedEndpaper ? vol.finishedAt || Date.now() : vol.finishedAt,
      }));
    },
    [paginatedPages, persistActiveVolumeUpdate]
  );

  const handleToggleDogEar = useCallback(
    (pageIndex: number) => {
      persistActiveVolumeUpdate((vol) => {
        const exists = vol.dogEaredPages.includes(pageIndex);
        return {
          ...vol,
          dogEaredPages: exists
            ? vol.dogEaredPages.filter((p) => p !== pageIndex)
            : [...vol.dogEaredPages, pageIndex].sort((a, b) => a - b),
        };
      });
    },
    [persistActiveVolumeUpdate]
  );

  const handleAddOrUpdateNote = useCallback(
    (blockId: string, text: string, existingId?: string) => {
      persistActiveVolumeUpdate((vol) => {
        if (existingId) {
          return {
            ...vol,
            notes: vol.notes.map((n) => (n.id === existingId ? { ...n, text } : n)),
          };
        }
        return {
          ...vol,
          notes: [
            ...vol.notes,
            {
              id: `note-${Date.now().toString(36)}`,
              blockId,
              text,
              createdAt: Date.now(),
              folded: text.length > 90,
            },
          ],
        };
      });
    },
    [persistActiveVolumeUpdate]
  );

  const handleDeleteNote = useCallback(
    (noteId: string) => {
      persistActiveVolumeUpdate((vol) => ({
        ...vol,
        notes: vol.notes.filter((n) => n.id !== noteId),
      }));
    },
    [persistActiveVolumeUpdate]
  );

  const handleToggleNoteFold = useCallback(
    (noteId: string) => {
      persistActiveVolumeUpdate((vol) => ({
        ...vol,
        notes: vol.notes.map((n) => (n.id === noteId ? { ...n, folded: !n.folded } : n)),
      }));
    },
    [persistActiveVolumeUpdate]
  );

  const handleSetHighlight = useCallback(
    (blockId: string, kind: HighlightKind | null) => {
      persistActiveVolumeUpdate((vol) => {
        const nextHighlights = { ...vol.highlights };
        if (kind === null) {
          delete nextHighlights[blockId];
        } else {
          nextHighlights[blockId] = kind;
        }
        return { ...vol, highlights: nextHighlights };
      });
    },
    [persistActiveVolumeUpdate]
  );

  const handleUpdateVolumeIdentity = useCallback(
    (patch: Partial<BookIdentity>) => {
      persistActiveVolumeUpdate((vol) => ({
        ...vol,
        identity: { ...vol.identity, ...patch },
      }));
    },
    [persistActiveVolumeUpdate]
  );

  const handleSaveFinalThought = useCallback(
    (thought: string) => {
      persistActiveVolumeUpdate((vol) => ({
        ...vol,
        finalThought: thought,
        finishedAt: vol.finishedAt || Date.now(),
      }));
    },
    [persistActiveVolumeUpdate]
  );

  const handleRemoveVolume = useCallback(
    async (id: string) => {
      stopAllSpeech();
      await removeVolume(id);
      setVolumes((prev) => {
        const next = prev.filter((v) => v.id !== id);
        if (activeBookId === id) {
          const fallback = next[0]?.id || null;
          setActiveBookId(fallback);
          saveLastActiveBookId(fallback);
          if (!fallback) setHasOpenedAnyBook(false);
          setView('table');
        }
        return next;
      });
    },
    [activeBookId, stopAllSpeech]
  );

  const handleEmptyReadingRoom = useCallback(async () => {
    stopAllSpeech();
    await clearAllVolumes();
    setVolumes([]);
    setActiveBookId(null);
    setHasOpenedAnyBook(false);
    setView('table');
  }, [stopAllSpeech]);

  // Read-aloud driver: speaks sentences on the current spread and turns pages automatically
  const startSpeakingFromPage = useCallback(
    (pageIndex: number) => {
      if (!activeVolume) return;
      unlockAudioOnUserGesture();
      const sessionId = ++speechSessionRef.current;

      const spreadPages =
        settings.pageMode === 'two-page'
          ? [paginatedPages[pageIndex], paginatedPages[pageIndex + 1]].filter(Boolean)
          : [paginatedPages[pageIndex]].filter(Boolean);

      const sectionTitle = spreadPages[0]?.sectionTitle || activeVolume.title;
      syncMediaSessionMetadata(
        activeVolume.title,
        activeVolume.author || 'The Quiet Volume',
        () => {
          resumeSpeaking();
          setIsSpeechPaused(false);
        },
        () => {
          pauseSpeaking();
          setIsSpeechPaused(true);
        }
      );

      const queue: { blockId: string; sentenceIndex: number; text: string }[] = [];
      for (const page of spreadPages) {
        if (!page || page.kind !== 'content' || !page.blocks) continue;
        for (const block of page.blocks) {
          if (block.kind === 'scene-break' || block.kind === 'code') continue;
          const sentences = splitIntoSentences(block.text);
          sentences.forEach((s, idx) => {
            queue.push({ blockId: block.id, sentenceIndex: idx, text: s });
          });
        }
      }

      queueRef.current = queue;
      queueCursorRef.current = 0;

      if (queue.length === 0) {
        const step = settings.pageMode === 'two-page' ? 2 : 1;
        if (pageIndex + step < paginatedPages.length - 1) {
          handleChangePageIndex(pageIndex + step);
          window.setTimeout(() => {
            if (speechSessionRef.current === sessionId) {
              startSpeakingFromPage(pageIndex + step);
            }
          }, 350);
        } else {
          stopAllSpeech();
        }
        return;
      }

      const speakNext = () => {
        if (speechSessionRef.current !== sessionId) return;
        if (queueCursorRef.current >= queue.length) {
          const step = settings.pageMode === 'two-page' ? 2 : 1;
          const nextIdx = pageIndex + step;
          if (nextIdx < paginatedPages.length - 1) {
            handleChangePageIndex(nextIdx);
            window.setTimeout(() => {
              if (speechSessionRef.current === sessionId) {
                startSpeakingFromPage(nextIdx);
              }
            }, 420);
          } else {
            stopAllSpeech();
          }
          return;
        }
        const cue = queue[queueCursorRef.current++];
        setActiveSpeechCue({ blockId: cue.blockId, sentenceIndex: cue.sentenceIndex });
        speakSentence(
          cue.text,
          {
            provider: settings.ttsProvider,
            voice: settings.ttsVoice,
            speed: settings.ttsSpeed,
            volumeId: activeVolume.id,
            audioMode: settings.ttsAudioMode || 'recorded',
          },
          speakNext,
          () => stopAllSpeech()
        );
      };

      currentSpeakNextRef.current = speakNext;
      setIsReadingAloud(true);
      setIsSpeechPaused(false);
      speakNext();
    },
    [
      activeVolume,
      paginatedPages,
      settings.pageMode,
      settings.ttsProvider,
      settings.ttsVoice,
      settings.ttsSpeed,
      settings.ttsAudioMode,
      handleChangePageIndex,
      stopAllSpeech,
    ]
  );

  const handleSkipSentence = useCallback(
    (direction: 'next' | 'prev') => {
      if (!isReadingAloud || !queueRef.current.length) return;
      stopSpeaking();
      if (direction === 'next') {
        currentSpeakNextRef.current?.();
      } else {
        queueCursorRef.current = Math.max(0, queueCursorRef.current - 2);
        currentSpeakNextRef.current?.();
      }
    },
    [isReadingAloud]
  );

  const handleRecordChapterToFile = useCallback(
    async (sectionIndex: number) => {
      if (!activeVolume) return;
      unlockAudioOnUserGesture();
      stopAllSpeech();
      setBindNotice('Preparing chapter audio recording...');
      const result = await recordChapterAudio(
        activeVolume,
        sectionIndex,
        settings,
        (progress) => {
          if (progress.status === 'recording') {
            setBindNotice(
              `Recording "${progress.chapterTitle}": Part ${progress.currentPart}/${progress.totalParts} (${progress.percent}%)`
            );
          } else if (progress.status === 'stitching') {
            setBindNotice('Stitching audio parts into single chapter MP3...');
          } else if (progress.status === 'saving') {
            setBindNotice('Saving single chapter MP3 to disk...');
          } else if (progress.status === 'done') {
            setBindNotice(`Saved ${progress.chapterTitle} MP3 to disk!`);
            setTimeout(() => setBindNotice(null), 3500);
          } else if (progress.status === 'error') {
            setBindNotice(`Error recording: ${progress.errorMessage}`);
            setTimeout(() => setBindNotice(null), 5000);
          }
        }
      );
      if (result) {
        const audio = getPersistentAudio() || new Audio();
        audio.src = result.url;
        audio.playbackRate = settings.ttsSpeed || 1.0;
        await audio.play().catch(() => {});
        setIsReadingAloud(true);
        setIsSpeechPaused(false);
      }
    },
    [activeVolume, settings, stopAllSpeech]
  );

  const handleStartSpeakingFromPage = useCallback(
    async (pageIndex: number) => {
      unlockAudioOnUserGesture();
      if (!activeVolume) return;
      const targetIdx = clampSpreadStart(pageIndex, paginatedPages.length, settings.pageMode);
      setView('reading');
      handleChangePageIndex(targetIdx);

      const targetPage = paginatedPages[pageIndex];
      const sectionIdx = targetPage?.sectionIndex ?? 0;

      // Check if full single chapter MP3 file exists on disk
      const storedFile = await getChapterAudioFile(activeVolume.title, sectionIdx);
      if (storedFile) {
        stopAllSpeech();
        const audio = getPersistentAudio() || new Audio();
        audio.src = storedFile.url;
        audio.playbackRate = settings.ttsSpeed || 1.0;
        await audio.play().catch(() => {});
        setIsReadingAloud(true);
        setIsSpeechPaused(false);
        setBindNotice(`Playing ${storedFile.file.name} from disk`);
        setTimeout(() => setBindNotice(null), 3000);
        return;
      }

      window.setTimeout(() => {
        startSpeakingFromPage(targetIdx);
      }, 150);
    },
    [activeVolume, paginatedPages, settings.pageMode, settings.ttsSpeed, handleChangePageIndex, startSpeakingFromPage, stopAllSpeech]
  );

  const handleToggleReadAloud = useCallback(() => {
    unlockAudioOnUserGesture();
    if (isReadingAloud) {
      if (isSpeechPaused) {
        resumeSpeaking();
        setIsSpeechPaused(false);
      } else {
        pauseSpeaking();
        setIsSpeechPaused(true);
      }
      return;
    }
    if (!activeVolume) return;
    const startIdx = clampSpreadStart(
      activeVolume.lastPageIndex,
      paginatedPages.length,
      settings.pageMode
    );
    setView('reading');
    window.setTimeout(() => startSpeakingFromPage(startIdx), 120);
  }, [
    isReadingAloud,
    isSpeechPaused,
    activeVolume,
    paginatedPages.length,
    settings.pageMode,
    startSpeakingFromPage,
  ]);

  const handlePauseResumeSpeech = useCallback(() => {
    if (!isReadingAloud) return;
    if (isSpeechPaused) {
      resumeSpeaking();
      setIsSpeechPaused(false);
    } else {
      pauseSpeaking();
      setIsSpeechPaused(true);
    }
  }, [isReadingAloud, isSpeechPaused]);

  // Allow pressing S from the table view to open the separate Settings Book directly
  useEffect(() => {
    if (view !== 'table') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      if (!isEditable && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        openSettingsBook('table', false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [view, openSettingsBook]);

  return (
    <ReadingEnvironment
      environment={settings.environment}
      lighting={effectiveLighting}
      reducedTexture={settings.reducedTexture}
      isDraggingFiles={isDraggingFiles}
      onDragFilesChange={setIsDraggingFiles}
      onDropFiles={handleIncomingFiles}
    >
      {bindNotice && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-6 left-1/2 z-50 -translate-x-1/2 rounded-[2px] border border-[#C6BBA6] bg-[#F5EFE2] px-4 py-2 font-hand-kalam text-sm text-[#2A231C] shadow-md"
        >
          {bindNotice}
        </div>
      )}

      {view === 'binding' && bindingJob && (
        <BindingAnimation
          title={bindingJob.primary.title}
          fileCount={bindingJob.fileCount}
          identity={bindingJob.primary.identity}
          reducedMotion={settings.reducedMotion}
          onComplete={finishBindingAnimation}
        />
      )}

      {view === 'table' && (
        <ClosedTableView
          volumes={volumes}
          activeBookId={activeBookId}
          hasOpenedAnyBook={hasOpenedAnyBook}
          bookSize={settings.bookSize}
          cameraTilt={settings.cameraTilt}
          lighting={effectiveLighting}
          reducedTexture={settings.reducedTexture}
          isDraggingFiles={isDraggingFiles}
          pendingPrompt={pendingPrompt}
          onSelectFiles={handleIncomingFiles}
          onBindSampleManuscript={handleBindSampleManuscript}
          onOpenVolume={(id) => openVolume(id)}
          onOpenSettingsBook={() => openSettingsBook('table', false)}
        />
      )}

      {view === 'reading' && activeVolume && (
        <OpenBookView
          volume={activeVolume}
          pages={paginatedPages}
          currentPageIndex={activeVolume.lastPageIndex}
          totalVolumesCount={volumes.length}
          settings={settings}
          effectiveLighting={effectiveLighting}
          resumeBlockId={resumeBlockId}
          isReadingAloud={isReadingAloud}
          isSpeechPaused={isSpeechPaused}
          activeSpeechCue={activeSpeechCue}
          liveCameraBarOpen={liveCameraBarOpen}
          onToggleLiveCameraBar={setLiveCameraBarOpen}
          onUpdateSettings={updateSettings}
          onChangePageIndex={handleChangePageIndex}
          onCloseBook={closeBook}
          onOpenBackCover={(focusSearch = false) => openSettingsBook('reading', focusSearch)}
          onToggleDogEar={handleToggleDogEar}
          onAddOrUpdateNote={handleAddOrUpdateNote}
          onDeleteNote={handleDeleteNote}
          onToggleNoteFold={handleToggleNoteFold}
          onSetHighlight={handleSetHighlight}
          onSaveFinalThought={handleSaveFinalThought}
          onRemoveVolume={handleRemoveVolume}
          onEmptyReadingRoom={handleEmptyReadingRoom}
          onToggleReadAloud={handleToggleReadAloud}
          onStartReadAloud={handleStartSpeakingFromPage}
          onRecordChapter={handleRecordChapterToFile}
          onSkipSentence={handleSkipSentence}
          onPauseResumeSpeech={handlePauseResumeSpeech}
          onStopSpeech={stopAllSpeech}
          onDisableRestReminder={() => updateSettings({ restReminderEnabled: false })}
        />
      )}

      {view === 'settings-book' && (
        <SettingsBookView
          volume={activeVolume}
          pages={paginatedPages}
          settings={settings}
          effectiveLighting={effectiveLighting}
          isReadingAloud={isReadingAloud}
          returnTarget={settingsReturnView === 'reading' && activeVolume ? 'reading' : 'table'}
          initialFocusSearch={focusSearchInSettings}
          onUpdateSettings={updateSettings}
          onUpdateVolumeIdentity={handleUpdateVolumeIdentity}
          onToggleReadAloud={handleToggleReadAloud}
          onAdjustCameraLive={() => {
            if (!activeVolume) return;
            setFocusSearchInSettings(false);
            setLiveCameraBarOpen(true);
            setView('reading');
          }}
          onJumpToPageIndex={(pageIdx, blockId) => {
            if (!activeVolume) return;
            handleChangePageIndex(pageIdx);
            if (blockId) setResumeBlockId(blockId);
            setFocusSearchInSettings(false);
            setView('reading');
          }}
          onReturn={() => {
            setFocusSearchInSettings(false);
            setView(settingsReturnView === 'reading' && activeVolume ? 'reading' : 'table');
          }}
          onCloseAllToTable={closeBook}
        />
      )}
    </ReadingEnvironment>
  );
}
