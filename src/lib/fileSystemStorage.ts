/**
 * Direct Local Folder Audio Storage via W3C File System Access API
 * Allows saving single .mp3 chapter audio files directly to user-selected folders on disk.
 */

const DB_NAME = 'quiet-volume-fs';
const STORE_HANDLES = 'directoryHandles';
const DIR_HANDLE_KEY = 'audiobooksDir';

function openHandleDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_HANDLES)) {
          db.createObjectStore(STORE_HANDLES);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function storeDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openHandleDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_HANDLES, 'readwrite');
      tx.objectStore(STORE_HANDLES).put(handle, DIR_HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function getStoredDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openHandleDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_HANDLES, 'readonly');
      const req = tx.objectStore(STORE_HANDLES).get(DIR_HANDLE_KEY);
      req.onsuccess = async () => {
        const handle = req.result as FileSystemDirectoryHandle | undefined;
        if (!handle) {
          resolve(null);
          return;
        }
        try {
          // Verify readwrite permission
          const status = await (handle as any).queryPermission({ mode: 'readwrite' });
          if (status === 'granted') {
            resolve(handle);
          } else {
            // Can be requested on user click
            resolve(handle);
          }
        } catch {
          resolve(handle);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export interface ChapterAudioCue {
  blockId: string;
  sentenceIndex: number;
  text: string;
  startSec: number;
  endSec: number;
}

export interface ChapterAudioMetadata {
  chapterIndex: number;
  chapterTitle: string;
  totalDurationSec: number;
  cues: ChapterAudioCue[];
  provider?: string;
  voice?: string;
  createdAt: number;
}

export function isOpfsSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.storage && typeof navigator.storage.getDirectory === 'function';
}

export async function getOpfsAudiobooksDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!isOpfsSupported()) return null;
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle('Audiobooks', { create: true });
  } catch {
    return null;
  }
}

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export async function chooseAudiobooksDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFileSystemAccessSupported()) return null;
  try {
    const handle = await (window as any).showDirectoryPicker({
      id: 'quiet-volume-audiobooks',
      mode: 'readwrite',
    });
    if (handle) {
      await storeDirectoryHandle(handle);
    }
    return handle;
  } catch (err: any) {
    if (err.name !== 'AbortError') {
      console.error('Failed to choose directory:', err);
    }
    return null;
  }
}

export function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);
}

export function formatChapterFileName(chapterIndex: number, chapterTitle: string): string {
  const padded = String(chapterIndex + 1).padStart(2, '0');
  const cleanTitle = sanitizeFileName(chapterTitle || 'Chapter');
  return `Chapter_${padded}_${cleanTitle}.mp3`;
}

async function getOrCreateBookSubdirectory(
  parent: FileSystemDirectoryHandle,
  bookTitle: string
): Promise<FileSystemDirectoryHandle> {
  const dirName = sanitizeFileName(bookTitle || 'Untitled_Book');
  return parent.getDirectoryHandle(dirName, { create: true });
}

export async function saveChapterAudioFile(
  bookTitle: string,
  chapterIndex: number,
  chapterTitle: string,
  audioBlob: Blob,
  metadata?: ChapterAudioMetadata
): Promise<string | null> {
  let savedPath: string | null = null;
  const fileName = formatChapterFileName(chapterIndex, chapterTitle);
  const jsonName = fileName.replace(/\.mp3$/, '.json');

  // 1. Save to OPFS dedicated directory (Mobile & Desktop native private disk)
  try {
    const opfsRoot = await getOpfsAudiobooksDirectory();
    if (opfsRoot) {
      const bookDir = await getOrCreateBookSubdirectory(opfsRoot, bookTitle);
      const fileHandle = await bookDir.getFileHandle(fileName, { create: true });
      const writable = await (fileHandle as any).createWritable();
      await writable.write(audioBlob);
      await writable.close();

      if (metadata) {
        const jsonHandle = await bookDir.getFileHandle(jsonName, { create: true });
        const jsonWritable = await (jsonHandle as any).createWritable();
        await jsonWritable.write(JSON.stringify(metadata, null, 2));
        await jsonWritable.close();
      }

      savedPath = `Audiobooks/${bookDir.name}/${fileName}`;
    }
  } catch (err) {
    console.warn('OPFS save warning:', err);
  }

  // 2. Also save to user-selected external folder if configured
  try {
    const externalRoot = await getStoredDirectoryHandle();
    if (externalRoot) {
      const hasPerm = await verifyPermission(externalRoot);
      if (hasPerm) {
        const bookDir = await getOrCreateBookSubdirectory(externalRoot, bookTitle);
        const fileHandle = await bookDir.getFileHandle(fileName, { create: true });
        const writable = await (fileHandle as any).createWritable();
        await writable.write(audioBlob);
        await writable.close();

        if (metadata) {
          const jsonHandle = await bookDir.getFileHandle(jsonName, { create: true });
          const jsonWritable = await (jsonHandle as any).createWritable();
          await jsonWritable.write(JSON.stringify(metadata, null, 2));
          await jsonWritable.close();
        }

        savedPath = `${bookDir.name}/${fileName}`;
      }
    }
  } catch (err) {
    console.warn('External directory save warning:', err);
  }

  return savedPath;
}

export async function getChapterAudioFile(
  bookTitle: string,
  chapterIndex: number,
  chapterTitle?: string
): Promise<{ file: File; url: string; metadata?: ChapterAudioMetadata } | null> {
  const padded = String(chapterIndex + 1).padStart(2, '0');
  const prefix = `Chapter_${padded}`;
  const dirName = sanitizeFileName(bookTitle || 'Untitled_Book');

  // Helper to extract file and metadata from a directory handle
  const tryReadFromDir = async (
    rootHandle: FileSystemDirectoryHandle
  ): Promise<{ file: File; url: string; metadata?: ChapterAudioMetadata } | null> => {
    try {
      const bookDir = await rootHandle.getDirectoryHandle(dirName, { create: false }).catch(() => null);
      if (!bookDir) return null;

      let targetHandle: FileSystemFileHandle | null = null;
      let targetName = '';
      for await (const [name, handle] of (bookDir as any).entries()) {
        if (handle.kind === 'file' && name.startsWith(prefix) && name.endsWith('.mp3')) {
          targetHandle = handle;
          targetName = name;
          break;
        }
      }

      if (!targetHandle && chapterTitle) {
        const explicitName = formatChapterFileName(chapterIndex, chapterTitle);
        targetHandle = await bookDir.getFileHandle(explicitName, { create: false }).catch(() => null);
        targetName = explicitName;
      }

      if (!targetHandle) return null;

      const file = await targetHandle.getFile();
      const url = URL.createObjectURL(file);

      // Attempt to read metadata sidecar
      let metadata: ChapterAudioMetadata | undefined;
      try {
        const jsonName = targetName.replace(/\.mp3$/, '.json');
        const jsonHandle = await bookDir.getFileHandle(jsonName, { create: false }).catch(() => null);
        if (jsonHandle) {
          const jsonFile = await jsonHandle.getFile();
          const jsonText = await jsonFile.text();
          metadata = JSON.parse(jsonText);
        }
      } catch {}

      return { file, url, metadata };
    } catch {
      return null;
    }
  };

  // 1. Try external directory first
  const externalRoot = await getStoredDirectoryHandle();
  if (externalRoot) {
    const res = await tryReadFromDir(externalRoot);
    if (res) return res;
  }

  // 2. Try OPFS dedicated directory
  const opfsRoot = await getOpfsAudiobooksDirectory();
  if (opfsRoot) {
    const res = await tryReadFromDir(opfsRoot);
    if (res) return res;
  }

  return null;
}

export async function hasChapterAudioFile(
  bookTitle: string,
  chapterIndex: number
): Promise<boolean> {
  const item = await getChapterAudioFile(bookTitle, chapterIndex);
  return !!item;
}

export async function listSavedChapterAudioFiles(bookTitle: string): Promise<number[]> {
  const result: number[] = [];
  const dirName = sanitizeFileName(bookTitle || 'Untitled_Book');

  const scanDir = async (rootHandle: FileSystemDirectoryHandle) => {
    try {
      const bookDir = await rootHandle.getDirectoryHandle(dirName, { create: false }).catch(() => null);
      if (!bookDir) return;
      for await (const [name, handle] of (bookDir as any).entries()) {
        if (handle.kind === 'file' && name.startsWith('Chapter_') && name.endsWith('.mp3')) {
          const match = name.match(/^Chapter_(\d+)/);
          if (match) {
            const chIdx = parseInt(match[1], 10) - 1;
            if (!isNaN(chIdx) && !result.includes(chIdx)) {
              result.push(chIdx);
            }
          }
        }
      }
    } catch {}
  };

  const externalRoot = await getStoredDirectoryHandle();
  if (externalRoot) await scanDir(externalRoot);

  const opfsRoot = await getOpfsAudiobooksDirectory();
  if (opfsRoot) await scanDir(opfsRoot);

  return result.sort((a, b) => a - b);
}

async function verifyPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    const query = await (handle as any).queryPermission({ mode: 'readwrite' });
    if (query === 'granted') return true;
    const request = await (handle as any).requestPermission({ mode: 'readwrite' });
    return request === 'granted';
  } catch {
    return false;
  }
}
