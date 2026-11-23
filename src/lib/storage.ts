import type { BookVolume, ReaderSettings } from '../types/book';
import {
  isValidEnvironmentSurface,
  isValidLightingMode,
  isValidPaperStock,
} from './lighting';

const DB_NAME = 'quiet-volume-library';
const DB_VERSION = 2;
const STORE_VOLUMES = 'volumes';
const STORE_CHAPTER_AUDIO = 'chapterAudio';
const SETTINGS_KEY = 'quiet-volume-settings-v1';
const ACTIVE_BOOK_KEY = 'quiet-volume-active-id-v1';
const CATALOG_KEY = 'quiet-volume-catalog-v1';
const FALLBACK_VOLUMES_KEY = 'quiet-volume-volumes-fallback-v1';

export interface VolumeCatalogStub {
  id: string;
  title: string;
  author?: string;
  pageCount: number;
  lastOpenedAt: number;
}

export interface ChapterAudioRecord {
  id: string; // `${volumeId}:${sectionIndex}`
  volumeId: string;
  sectionIndex: number;
  sectionTitle: string;
  audioBlob: Blob;
  mimeType: string;
  provider: string;
  voice: string;
  createdAt: number;
}

export async function ensurePersistentStorage(): Promise<boolean> {
  if (
    typeof navigator !== 'undefined' &&
    navigator.storage &&
    typeof navigator.storage.persist === 'function'
  ) {
    try {
      const isPersisted = await navigator.storage.persisted();
      if (!isPersisted) {
        return await navigator.storage.persist();
      }
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function loadCatalog(): VolumeCatalogStub[] {
  try {
    const raw = localStorage.getItem(CATALOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCatalog(stubs: VolumeCatalogStub[]): void {
  try {
    localStorage.setItem(CATALOG_KEY, JSON.stringify(stubs));
  } catch {
    // ignore
  }
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  pageMode: 'two-page',
  pageFormat: 'notebook',
  paperRuling: 'plain',
  bookSize: 'a5-notebook',
  cameraZoom: 1.0,
  cameraTilt: 8,
  writingHand: 'kalam',
  writingSize: 'natural',
  pageSpacing: 'natural',
  paper: 'white-cotton',
  lighting: 'daylight',
  autoLighting: false,
  environment: 'wooden-table',
  reducedMotion: false,
  reducedTexture: false,
  soundEnabled: false,
  useColoredRibbons: false,
  restReminderEnabled: true,
  ttsProvider: 'deepgram',
  ttsVoice: 'aura-asteria-en',
  ttsSpeed: 1.0,
  ttsAudioMode: 'recorded',
};

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_VOLUMES)) {
          db.createObjectStore(STORE_VOLUMES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_CHAPTER_AUDIO)) {
          const audioStore = db.createObjectStore(STORE_CHAPTER_AUDIO, { keyPath: 'id' });
          audioStore.createIndex('volumeId', 'volumeId', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveChapterAudio(record: ChapterAudioRecord): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_CHAPTER_AUDIO, 'readwrite');
      tx.objectStore(STORE_CHAPTER_AUDIO).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function loadChapterAudio(
  volumeId: string,
  sectionIndex: number
): Promise<ChapterAudioRecord | null> {
  const db = await openDb();
  if (!db) return null;
  const id = `${volumeId}:${sectionIndex}`;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_CHAPTER_AUDIO, 'readonly');
      const req = tx.objectStore(STORE_CHAPTER_AUDIO).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function hasChapterAudio(
  volumeId: string,
  sectionIndex: number
): Promise<boolean> {
  const record = await loadChapterAudio(volumeId, sectionIndex);
  return !!record && !!record.audioBlob;
}

export async function listSavedAudioChapters(volumeId: string): Promise<number[]> {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_CHAPTER_AUDIO, 'readonly');
      const store = tx.objectStore(STORE_CHAPTER_AUDIO);
      const req = store.getAll();
      req.onsuccess = () => {
        const records = (req.result as ChapterAudioRecord[]) || [];
        const sectionIndices = records
          .filter((r) => r.volumeId === volumeId)
          .map((r) => r.sectionIndex);
        resolve(sectionIndices);
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function deleteVolumeAudio(volumeId: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_CHAPTER_AUDIO, 'readwrite');
      const store = tx.objectStore(STORE_CHAPTER_AUDIO);
      const req = store.getAll();
      req.onsuccess = () => {
        const records = (req.result as ChapterAudioRecord[]) || [];
        for (const r of records) {
          if (r.volumeId === volumeId) {
            store.delete(r.id);
          }
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function saveAudioBlob(
  id: string,
  volumeId: string,
  blob: Blob,
  meta?: { sectionIndex?: number; sectionTitle?: string; provider?: string; voice?: string }
): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_CHAPTER_AUDIO, 'readwrite');
      tx.objectStore(STORE_CHAPTER_AUDIO).put({
        id,
        volumeId: volumeId || 'global',
        sectionIndex: meta?.sectionIndex ?? -1,
        sectionTitle: meta?.sectionTitle ?? '',
        audioBlob: blob,
        mimeType: blob.type || 'audio/mpeg',
        provider: meta?.provider || 'default',
        voice: meta?.voice || '',
        createdAt: Date.now(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function loadAudioBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_CHAPTER_AUDIO, 'readonly');
      const req = tx.objectStore(STORE_CHAPTER_AUDIO).get(id);
      req.onsuccess = () => {
        const record = req.result as ChapterAudioRecord | undefined;
        resolve(record?.audioBlob || null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function countVolumeAudio(volumeId: string): Promise<number> {
  const db = await openDb();
  if (!db) return 0;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_CHAPTER_AUDIO, 'readonly');
      const store = tx.objectStore(STORE_CHAPTER_AUDIO);
      const req = store.getAll();
      req.onsuccess = () => {
        const records = (req.result as ChapterAudioRecord[]) || [];
        resolve(records.filter((r) => r.volumeId === volumeId).length);
      };
      req.onerror = () => resolve(0);
    } catch {
      resolve(0);
    }
  });
}

export async function loadVolumes(): Promise<BookVolume[]> {
  const db = await openDb();
  if (db) {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_VOLUMES, 'readonly');
        const store = tx.objectStore(STORE_VOLUMES);
        const req = store.getAll();
        req.onsuccess = () => {
          const items = (req.result as BookVolume[]) || [];
          items.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
          resolve(items);
        };
        req.onerror = () => resolve(loadFallbackVolumes());
      } catch {
        resolve(loadFallbackVolumes());
      }
    });
  }
  return loadFallbackVolumes();
}

function loadFallbackVolumes(): BookVolume[] {
  try {
    const raw = localStorage.getItem(FALLBACK_VOLUMES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BookVolume[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveVolume(volume: BookVolume): Promise<void> {
  const db = await openDb();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_VOLUMES, 'readwrite');
        tx.objectStore(STORE_VOLUMES).put(volume);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  // Store only lightweight metadata stub in localStorage (<500 bytes per book)
  // to prevent mobile 5MB localStorage overflow while keeping full books in IndexedDB
  try {
    const pageCount = (volume as any).pageCount || Math.max(1, volume.lastPageIndex + 1);
    const stub: VolumeCatalogStub = {
      id: volume.id,
      title: volume.title,
      author: volume.author,
      pageCount,
      lastOpenedAt: volume.lastOpenedAt,
    };
    const catalog = loadCatalog().filter((v) => v.id !== volume.id);
    catalog.unshift(stub);
    saveCatalog(catalog);
  } catch {
    // Ignore quota errors in catalog stub
  }
}

export async function removeVolume(volumeId: string): Promise<void> {
  const db = await openDb();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_VOLUMES, 'readwrite');
        tx.objectStore(STORE_VOLUMES).delete(volumeId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
    await deleteVolumeAudio(volumeId);
  }
  try {
    const catalog = loadCatalog().filter((v) => v.id !== volumeId);
    saveCatalog(catalog);
    const remaining = loadFallbackVolumes().filter((v) => v.id !== volumeId);
    if (remaining.length > 0) {
      localStorage.setItem(FALLBACK_VOLUMES_KEY, JSON.stringify(remaining));
    } else {
      localStorage.removeItem(FALLBACK_VOLUMES_KEY);
    }
  } catch {
    // ignore
  }
}

export async function clearAllVolumes(): Promise<void> {
  const db = await openDb();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction([STORE_VOLUMES, STORE_CHAPTER_AUDIO], 'readwrite');
        tx.objectStore(STORE_VOLUMES).clear();
        tx.objectStore(STORE_CHAPTER_AUDIO).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
  try {
    localStorage.removeItem(CATALOG_KEY);
    localStorage.removeItem(FALLBACK_VOLUMES_KEY);
    localStorage.removeItem(ACTIVE_BOOK_KEY);
  } catch {
    // ignore
  }
}

export async function downloadLibraryBackup(): Promise<void> {
  const volumes = await loadVolumes();
  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    volumeCount: volumes.length,
    volumes,
  };
  const json = JSON.stringify(backup, null, 2);
  if (typeof document !== 'undefined') {
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `quiet-volume-library-backup-${dateStr}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function sanitizeSettings(settings?: Partial<ReaderSettings> | null): ReaderSettings {
  if (!settings || typeof settings !== 'object') {
    return { ...DEFAULT_SETTINGS };
  }
  const clean: ReaderSettings = { ...DEFAULT_SETTINGS, ...settings };
  if (!isValidLightingMode(clean.lighting)) {
    clean.lighting = DEFAULT_SETTINGS.lighting;
  }
  if (!isValidPaperStock(clean.paper)) {
    clean.paper = DEFAULT_SETTINGS.paper;
  }
  if (!isValidEnvironmentSurface(clean.environment)) {
    clean.environment = DEFAULT_SETTINGS.environment;
  }
  return clean;
}

export function loadSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      const prefersReduced =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const hour = new Date().getHours();
      const defaultLighting = hour >= 19 || hour < 6 ? 'warm-lamp' : 'daylight';
      const defaultPageMode =
        typeof window !== 'undefined' && window.innerWidth < 960 ? 'single' : 'two-page';
      return sanitizeSettings({
        ...DEFAULT_SETTINGS,
        lighting: defaultLighting,
        pageMode: defaultPageMode,
        reducedMotion: Boolean(prefersReduced),
      });
    }
    const parsed = JSON.parse(raw);
    return sanitizeSettings(parsed);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: ReaderSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(sanitizeSettings(settings)));
  } catch {
    // ignore
  }
}

export function loadLastActiveBookId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_BOOK_KEY);
  } catch {
    return null;
  }
}

export function saveLastActiveBookId(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(ACTIVE_BOOK_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_BOOK_KEY);
    }
  } catch {
    // ignore
  }
}

export function estimateVolumeBytes(volume: BookVolume): number {
  try {
    return new Blob([JSON.stringify(volume)]).size;
  } catch {
    return JSON.stringify(volume).length * 2;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function exportVolumeAsMarkdown(volume: BookVolume): void {
  const lines: string[] = [];
  lines.push(`# ${volume.title}`);
  if (volume.author) lines.push(`By ${volume.author}`);
  lines.push('');

  for (const block of volume.blocks) {
    if (block.kind === 'chapter-title') {
      lines.push(`\n## ${block.text}\n`);
    } else if (block.kind === 'heading') {
      lines.push(`\n### ${block.text}\n`);
    } else if (block.kind === 'scene-break') {
      lines.push('\n***\n');
    } else if (block.kind === 'quote') {
      lines.push(`> ${block.text}\n`);
    } else if (block.kind === 'code') {
      lines.push(`\`\`\`\n${block.text}\n\`\`\`\n`);
    } else if (block.kind === 'source-note') {
      lines.push(`_${block.text}_\n`);
    } else {
      lines.push(`${block.text}\n`);
    }

    const blockNotes = volume.notes.filter((n) => n.blockId === block.id);
    for (const note of blockNotes) {
      lines.push(`[Margin note: ${note.text}]\n`);
    }
  }

  if (volume.finalThought) {
    lines.push(`\n---\nFinal thought: ${volume.finalThought}\n`);
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${volume.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
