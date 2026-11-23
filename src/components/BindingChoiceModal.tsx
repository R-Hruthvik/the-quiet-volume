import React, { useEffect, useRef, useState } from 'react';
import { processImportedFolder } from '../lib/fileImporter';
import { ColophonMark } from './BookOrnaments';

export interface StagedChapter {
  id: string;
  file: File;
  name: string;
  size: number;
}

export interface BindingChoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBind: (files: File[], title?: string) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function BindingChoiceModal({ isOpen, onClose, onBind }: BindingChoiceModalProps) {
  const [view, setView] = useState<'choices' | 'staging'>('choices');
  const [stagedFiles, setStagedFiles] = useState<StagedChapter[]>([]);
  const [customTitle, setCustomTitle] = useState('');

  const singleFileInputRef = useRef<HTMLInputElement | null>(null);
  const stagingFileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute('webkitdirectory', '');
      folderInputRef.current.setAttribute('directory', '');
      (folderInputRef.current as any).webkitdirectory = true;
      (folderInputRef.current as any).directory = true;
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setView('choices');
      setStagedFiles([]);
      setCustomTitle('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Option 1: Single file picker handler
  const handleSingleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length > 0) {
      onBind(selected);
      onClose();
    }
    e.target.value = '';
  };

  // Option 2: Staging Tray files handler (can be called repeatedly across folders)
  const handleStagingFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length > 0) {
      const newChapters: StagedChapter[] = selected.map((file, idx) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${Date.now()}-${idx}`,
        file,
        name: file.name.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' '),
        size: file.size,
      }));

      setStagedFiles((prev) => {
        const updated = [...prev, ...newChapters];
        if (!customTitle && updated.length > 0) {
          setCustomTitle(updated[0].name || 'Personal Volume');
        }
        return updated;
      });
    }
    e.target.value = '';
  };

  // Option 3: Entire folder picker handler (Android SAF + Desktop)
  const handleFolderChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length > 0) {
      const { files: sorted, title } = await processImportedFolder(selected);
      if (sorted.length > 0) {
        onBind(sorted, title);
        onClose();
      }
    }
    e.target.value = '';
  };

  const triggerFolderPicker = async () => {
    // If showDirectoryPicker is supported (Desktop Chromium), use it; Android Chrome uses the input
    if (
      typeof window !== 'undefined' &&
      'showDirectoryPicker' in window &&
      !/Android/i.test(navigator.userAgent)
    ) {
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
                Object.defineProperty(file, 'webkitRelativePath', {
                  value: prefix ? `${prefix}/${file.name}` : `${handle.name}/${file.name}`,
                  writable: true,
                });
                collectedFiles.push(file);
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
          const { files: sorted, title } = await processImportedFolder(collectedFiles);
          onBind(sorted, title || dirHandle.name);
          onClose();
          return;
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }

    // Android Chrome or fallback: trigger native input with webkitdirectory
    folderInputRef.current?.click();
  };

  const moveChapter = (index: number, direction: 'up' | 'down') => {
    setStagedFiles((prev) => {
      const targetIdx = direction === 'up' ? index - 1 : index + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(targetIdx, 0, item);
      return copy;
    });
  };

  const removeChapter = (id: string) => {
    setStagedFiles((prev) => prev.filter((item) => item.id !== id));
  };

  const handleBindStagedFiles = () => {
    if (stagedFiles.length === 0) return;
    const filesToBind = stagedFiles.map((s) => s.file);
    const finalTitle = customTitle.trim() || 'Collected Volume';
    onBind(filesToBind, finalTitle);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="binding-choice-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 sm:p-6 backdrop-blur-[2px] overflow-y-auto"
      onClick={onClose}
    >
      {/* Hidden file pickers */}
      <input
        ref={singleFileInputRef}
        type="file"
        accept=".txt,.md,.markdown,.text,.pdf,.epub,.zip,text/plain,application/pdf,application/epub+zip,application/zip"
        onChange={handleSingleFileChange}
        className="sr-only"
        aria-hidden="true"
      />
      <input
        ref={stagingFileInputRef}
        type="file"
        multiple
        accept=".txt,.md,.markdown,.text,.pdf,.epub,.zip,text/plain,application/pdf,application/epub+zip,application/zip"
        onChange={handleStagingFilesChange}
        className="sr-only"
        aria-hidden="true"
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        accept=".txt,.md,.markdown,.text,.pdf,.epub,text/plain,application/pdf"
        onChange={handleFolderChange}
        className="sr-only"
        aria-hidden="true"
      />

      <div
        className="relative w-full max-w-lg rounded-[3px] border border-[#C6BBA6] bg-[#F7F2E7] p-5 sm:p-7 text-[#2A231C] shadow-2xl texture-paper-grain my-auto max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{ transform: 'rotate(-0.3deg)' }}
      >
        {/* Header decoration & title */}
        <div className="flex items-center justify-between border-b border-[#2A231C]/15 pb-3">
          <div className="flex items-center gap-2.5">
            <ColophonMark symbol="leaf" size={20} color="#7B5D3B" />
            <h2 id="binding-choice-title" className="font-hand-kalam text-xl sm:text-2xl font-bold tracking-tight">
              {view === 'choices' ? 'Bind New Volume' : 'Staging Tray'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close binding dialog"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xs p-2 font-hand-patrick text-sm text-[#7C7164] transition-colors hover:text-[#2A231C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7B5D3B]/60"
          >
            close
          </button>
        </div>

        {view === 'choices' ? (
          /* 3-Choice Selection View */
          <div className="mt-4 space-y-3.5">
            <p className="font-hand-patrick text-sm text-[#665A4D]">
              Choose how you would like to ingest and bind your documents into a quiet reading volume:
            </p>

            {/* Option 1: Single Manuscript */}
            <button
              type="button"
              onClick={() => singleFileInputRef.current?.click()}
              className="group flex min-h-[58px] w-full items-start gap-3.5 rounded-[2px] border border-[#D5CABB] bg-[#FAF6EE] p-3.5 text-left transition-all hover:border-[#8C7A63] hover:bg-[#FFFDF9] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7B5D3B]/60"
            >
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[2px] bg-[#EFE8DA] text-[#6B5A47] group-hover:bg-[#E5DCCB]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <line x1="10" y1="9" x2="8" y2="9" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <span className="block font-hand-kalam text-base font-semibold text-[#2D241C] group-hover:text-[#684C2B]">
                  Single Manuscript
                </span>
                <span className="block font-hand-patrick text-xs text-[#706456]">
                  Bind 1 document (TXT, Markdown, PDF, EPUB, or ZIP).
                </span>
              </div>
            </button>

            {/* Option 2: Multiple Files (Different Folders) */}
            <button
              type="button"
              onClick={() => setView('staging')}
              className="group flex min-h-[58px] w-full items-start gap-3.5 rounded-[2px] border border-[#D5CABB] bg-[#FAF6EE] p-3.5 text-left transition-all hover:border-[#8C7A63] hover:bg-[#FFFDF9] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7B5D3B]/60"
            >
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[2px] bg-[#EFE8DA] text-[#6B5A47] group-hover:bg-[#E5DCCB]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polygon points="12 2 2 7 12 12 22 7 12 2" />
                  <polyline points="2 17 12 22 22 17" />
                  <polyline points="2 12 12 17 22 12" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <span className="block font-hand-kalam text-base font-semibold text-[#2D241C] group-hover:text-[#684C2B]">
                  Multiple Files (Different Folders)
                </span>
                <span className="block font-hand-patrick text-xs text-[#706456]">
                  Pick files from various locations, reorder chapters, and bind into one volume.
                </span>
              </div>
            </button>

            {/* Option 3: Entire Folder */}
            <button
              type="button"
              onClick={triggerFolderPicker}
              className="group flex min-h-[58px] w-full items-start gap-3.5 rounded-[2px] border border-[#D5CABB] bg-[#FAF6EE] p-3.5 text-left transition-all hover:border-[#8C7A63] hover:bg-[#FFFDF9] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7B5D3B]/60"
            >
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[2px] bg-[#EFE8DA] text-[#6B5A47] group-hover:bg-[#E5DCCB]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <span className="block font-hand-kalam text-base font-semibold text-[#2D241C] group-hover:text-[#684C2B]">
                  Entire Folder
                </span>
                <span className="block font-hand-patrick text-xs text-[#706456]">
                  Android folder picker: reads all chapters, sorts naturally, and sets folder name as title.
                </span>
              </div>
            </button>
          </div>
        ) : (
          /* Staging Tray View */
          <div className="mt-3 flex flex-1 flex-col overflow-hidden">
            {/* Custom Book Title Input */}
            <div className="mb-3">
              <label htmlFor="staging-book-title" className="block font-hand-patrick text-xs font-medium text-[#5D5245]">
                Book Title
              </label>
              <input
                id="staging-book-title"
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="e.g. My Collected Essays"
                className="mt-1 w-full rounded-[2px] border border-[#C6BBA6] bg-[#FCFAF5] px-3 py-2 font-hand-kalam text-base text-[#2A231C] placeholder:text-[#9A8E7E] focus:border-[#7B5D3B] focus:outline-none"
              />
            </div>

            {/* Action Row: Add Files button */}
            <div className="mb-2 flex items-center justify-between">
              <span className="font-hand-patrick text-xs text-[#706456]">
                {stagedFiles.length === 0
                  ? 'No documents staged yet.'
                  : `${stagedFiles.length} document${stagedFiles.length === 1 ? '' : 's'} staged`}
              </span>
              <button
                type="button"
                onClick={() => stagingFileInputRef.current?.click()}
                className="inline-flex min-h-[44px] items-center justify-center rounded-[2px] border border-[#8C7A63]/60 bg-[#EFE8DA] px-3.5 py-1.5 font-hand-kalam text-xs font-semibold text-[#3A3025] transition-colors hover:bg-[#E5DCCB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7B5D3B]/60"
              >
                {stagedFiles.length === 0 ? '+ Add Files' : '+ Add More Files'}
              </button>
            </div>

            {/* Staged Files List with reorder and remove */}
            <div className="quiet-scroll my-1 max-h-56 min-h-[120px] flex-1 overflow-y-auto rounded-[2px] border border-[#D5CABB] bg-[#FAF7F0] p-2">
              {stagedFiles.length === 0 ? (
                <div className="flex h-full min-h-[100px] flex-col items-center justify-center p-4 text-center">
                  <p className="font-hand-kalam text-sm text-[#7F7466]">
                    The tray is empty.
                  </p>
                  <p className="mt-1 font-hand-patrick text-xs text-[#9E9283]">
                    Tap “+ Add Files” to select documents from your device. You can tap again to add files from other folders.
                  </p>
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {stagedFiles.map((item, index) => (
                    <li
                      key={item.id}
                      className="flex min-h-[44px] items-center justify-between gap-2 rounded-[2px] border border-[#E2D8C9] bg-[#FFFDF9] px-2.5 py-1.5"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <span className="shrink-0 font-book-mono text-[11px] text-[#8C7F72]">
                          #{index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-hand-kalam text-sm text-[#2A231C] leading-snug">
                            {item.file.name}
                          </p>
                          <span className="font-book-mono text-[10px] text-[#8C7F72]">
                            {formatFileSize(item.size)}
                          </span>
                        </div>
                      </div>

                      {/* Reorder & Remove Controls (Touch targets >= 44px) */}
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveChapter(index, 'up')}
                          disabled={index === 0}
                          aria-label={`Move ${item.file.name} up`}
                          className="inline-flex min-h-[44px] min-w-[40px] items-center justify-center rounded-xs text-[#6B5E4F] transition-opacity hover:text-[#2A231C] disabled:opacity-25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7B5D3B]/60"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="18 15 12 9 6 15" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => moveChapter(index, 'down')}
                          disabled={index === stagedFiles.length - 1}
                          aria-label={`Move ${item.file.name} down`}
                          className="inline-flex min-h-[44px] min-w-[40px] items-center justify-center rounded-xs text-[#6B5E4F] transition-opacity hover:text-[#2A231C] disabled:opacity-25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7B5D3B]/60"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => removeChapter(item.id)}
                          aria-label={`Remove ${item.file.name}`}
                          className="inline-flex min-h-[44px] min-w-[40px] items-center justify-center rounded-xs text-[#8B483B] transition-opacity hover:text-[#B3261E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7B5D3B]/60"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#2A231C]/15 pt-3">
              <button
                type="button"
                onClick={() => setView('choices')}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xs px-3 py-2 font-hand-patrick text-sm text-[#6E6356] transition-colors hover:text-[#2A231C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7B5D3B]/60"
              >
                ← Back
              </button>

              <button
                type="button"
                onClick={handleBindStagedFiles}
                disabled={stagedFiles.length === 0}
                className="inline-flex min-h-[44px] items-center justify-center rounded-[2px] bg-[#6B4E32] px-5 py-2 font-hand-kalam text-sm font-semibold text-[#F7F2E7] shadow-sm transition-all hover:bg-[#573F28] disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7B5D3B]/60"
              >
                Bind into Book ({stagedFiles.length})
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
