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
  audioBlob: Blob
): Promise<string | null> {
  let root = await getStoredDirectoryHandle();
  if (!root) {
    root = await chooseAudiobooksDirectory();
  }
  if (!root) return null;

  try {
    const hasPerm = await verifyPermission(root);
    if (!hasPerm) return null;

    const bookDir = await getOrCreateBookSubdirectory(root, bookTitle);
    const fileName = formatChapterFileName(chapterIndex, chapterTitle);
    const fileHandle = await bookDir.getFileHandle(fileName, { create: true });
    const writable = await (fileHandle as any).createWritable();
    await writable.write(audioBlob);
    await writable.close();
    return `${bookDir.name}/${fileName}`;
  } catch (err) {
    console.error('Error saving chapter audio file to disk:', err);
    return null;
  }
}

export async function getChapterAudioFile(
  bookTitle: string,
  chapterIndex: number,
  chapterTitle?: string
): Promise<{ file: File; url: string } | null> {
  const root = await getStoredDirectoryHandle();
  if (!root) return null;

  try {
    const hasPerm = await verifyPermission(root);
    if (!hasPerm) return null;

    const dirName = sanitizeFileName(bookTitle || 'Untitled_Book');
    const bookDir = await root.getDirectoryHandle(dirName, { create: false });

    // Look for file starting with `Chapter_${padded}`
    const padded = String(chapterIndex + 1).padStart(2, '0');
    const prefix = `Chapter_${padded}`;

    let targetHandle: FileSystemFileHandle | null = null;
    for await (const [name, handle] of (bookDir as any).entries()) {
      if (handle.kind === 'file' && name.startsWith(prefix) && name.endsWith('.mp3')) {
        targetHandle = handle;
        break;
      }
    }

    if (!targetHandle && chapterTitle) {
      const explicitName = formatChapterFileName(chapterIndex, chapterTitle);
      targetHandle = await bookDir.getFileHandle(explicitName, { create: false }).catch(() => null);
    }

    if (!targetHandle) return null;

    const file = await targetHandle.getFile();
    const url = URL.createObjectURL(file);
    return { file, url };
  } catch {
    return null;
  }
}

export async function hasChapterAudioFile(
  bookTitle: string,
  chapterIndex: number
): Promise<boolean> {
  const item = await getChapterAudioFile(bookTitle, chapterIndex);
  return !!item;
}

export async function listSavedChapterAudioFiles(bookTitle: string): Promise<number[]> {
  const root = await getStoredDirectoryHandle();
  if (!root) return [];

  try {
    const hasPerm = await verifyPermission(root);
    if (!hasPerm) return [];

    const dirName = sanitizeFileName(bookTitle || 'Untitled_Book');
    const bookDir = await root.getDirectoryHandle(dirName, { create: false }).catch(() => null);
    if (!bookDir) return [];

    const result: number[] = [];
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
    return result;
  } catch {
    return [];
  }
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
