/**
 * Chapter Recorder & Audio Stitcher
 * Splits long chapters into provider-safe prose chunks, synthesizes them sequentially
 * with the exact same voice model, stitches them into a single seamless .mp3 file,
 * and saves it directly to the user-selected folder on disk.
 */

import type { BookVolume, ReaderSettings, TTSProvider } from '../types/book';
import { splitIntoSentences } from './tts';
import {
  ChapterAudioCue,
  ChapterAudioMetadata,
  formatChapterFileName,
  saveChapterAudioFile,
} from './fileSystemStorage';
import { saveChapterAudio } from './storage';

export interface ChapterRecordingProgress {
  chapterIndex: number;
  chapterTitle: string;
  currentPart: number;
  totalParts: number;
  percent: number;
  status: 'slicing' | 'recording' | 'stitching' | 'saving' | 'done' | 'error';
  errorMessage?: string;
}

export function getProviderMaxChunkLength(provider?: TTSProvider): number {
  switch (provider) {
    case 'groq':
      return 180; // Groq Orpheus hard limit is 200 chars
    case 'deepgram':
      return 1800; // Deepgram Aura optimal prose limit under 2,000
    case 'fish':
      // Fish Audio has a strict 50 requests/day free tier quota.
      // 2,500 chars strikes the optimal balance: stays within streaming timeout while minimizing request consumption.
      return 2500;
    case 'elevenlabs':
      // ElevenLabs Turbo models support generous context
      return 3500;
    default:
      return 1800;
  }
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3,
  backoffMs = 1500
): Promise<Response> {
  let lastError: any = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`Server returned status ${res.status}`);
      }
      const errText = await res.text().catch(() => '');
      throw new Error(`TTS error ${res.status}: ${errText.slice(0, 100)}`);
    } catch (err: any) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, backoffMs * attempt));
      }
    }
  }
  throw lastError || new Error('Request failed after retries');
}

async function getAudioBlobDuration(blob: Blob): Promise<number> {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return 2.0;
  return new Promise((resolve) => {
    try {
      const audio = new Audio();
      const url = URL.createObjectURL(blob);
      audio.preload = 'metadata';
      audio.src = url;
      audio.onloadedmetadata = () => {
        const d = audio.duration;
        URL.revokeObjectURL(url);
        resolve(isFinite(d) && d > 0 ? d : 2.0);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(2.0);
      };
    } catch {
      resolve(2.0);
    }
  });
}

/**
 * Cleanly breaks chapter text into natural chunks at paragraph or sentence boundaries
 * without ever cutting words, dialogue, or sentences in half.
 */
export function sliceTextIntoNaturalChunks(fullText: string, maxChunkLength: number): string[] {
  const trimmed = fullText.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChunkLength) return [trimmed];

  const paragraphs = trimmed.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let currentBuffer = '';

  for (const para of paragraphs) {
    // If the paragraph itself fits in the remaining space of current chunk:
    if ((currentBuffer ? currentBuffer.length + 1 + para.length : para.length) <= maxChunkLength) {
      currentBuffer = currentBuffer ? `${currentBuffer}\n\n${para}` : para;
    } else {
      // If current buffer already has text, flush it first
      if (currentBuffer) {
        chunks.push(currentBuffer);
        currentBuffer = '';
      }

      // If single paragraph exceeds maxChunkLength, split it by sentences
      if (para.length > maxChunkLength) {
        const sentences = splitIntoSentences(para);
        let sentenceBuffer = '';
        for (const s of sentences) {
          if ((sentenceBuffer ? sentenceBuffer.length + 1 + s.length : s.length) <= maxChunkLength) {
            sentenceBuffer = sentenceBuffer ? `${sentenceBuffer} ${s}` : s;
          } else {
            if (sentenceBuffer) chunks.push(sentenceBuffer);
            sentenceBuffer = s;
          }
        }
        if (sentenceBuffer) currentBuffer = sentenceBuffer;
      } else {
        currentBuffer = para;
      }
    }
  }

  if (currentBuffer) chunks.push(currentBuffer);
  return chunks;
}

function stripId3Tag(buf: ArrayBuffer): Uint8Array {
  const u8 = new Uint8Array(buf);
  if (u8.length >= 10 && u8[0] === 0x49 && u8[1] === 0x44 && u8[2] === 0x33) {
    const flags = u8[5];
    const size =
      ((u8[6] & 0x7f) << 21) |
      ((u8[7] & 0x7f) << 14) |
      ((u8[8] & 0x7f) << 7) |
      (u8[9] & 0x7f);
    const hasFooter = (flags & 0x10) !== 0;
    const tagSize = 10 + size + (hasFooter ? 10 : 0);
    if (tagSize < u8.length) {
      return u8.subarray(tagSize);
    }
  }
  return u8;
}

/**
 * Concatenates multiple MP3 blobs into a single continuous MP3 Blob,
 * stripping ID3 headers from subsequent chunks to prevent playback stalls in mobile Safari & Chrome.
 */
export async function stitchAudioBlobs(blobs: Blob[]): Promise<Blob> {
  if (blobs.length === 0) {
    return new Blob([], { type: 'audio/mpeg' });
  }
  if (blobs.length === 1) {
    return blobs[0];
  }

  const arrayBuffers = await Promise.all(blobs.map((b) => b.arrayBuffer()));
  const chunks: Uint8Array[] = arrayBuffers.map((buf, idx) =>
    idx === 0 ? new Uint8Array(buf) : stripId3Tag(buf)
  );

  let totalLength = 0;
  for (const c of chunks) {
    totalLength += c.byteLength;
  }

  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }

  return new Blob([merged], { type: 'audio/mpeg' });
}

function subdivideOversizedSentence(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];
  const parts: string[] = [];
  let remaining = text.trim();
  while (remaining.length > maxLength) {
    const windowText = remaining.slice(0, maxLength);
    let splitIdx = -1;
    for (const punct of ['; ', ', ', '—', ' - ', ' ']) {
      const idx = windowText.lastIndexOf(punct);
      if (idx > maxLength * 0.35) {
        splitIdx = idx + punct.length;
        break;
      }
    }
    if (splitIdx <= 0) {
      splitIdx = maxLength;
    }
    const part = remaining.slice(0, splitIdx).trim();
    if (part) parts.push(part);
    remaining = remaining.slice(splitIdx).trim();
  }
  if (remaining) {
    parts.push(remaining);
  }
  return parts;
}

export async function recordChapterAudio(
  volume: BookVolume,
  sectionIndex: number,
  settings: ReaderSettings,
  onProgress?: (progress: ChapterRecordingProgress) => void
): Promise<{ blob: Blob; fileName: string; url: string; metadata?: ChapterAudioMetadata } | null> {
  const section = volume.sections.find((s) => s.index === sectionIndex) || volume.sections[0];
  const chapterTitle = section?.title || `Chapter ${sectionIndex + 1}`;

  // 1. Gather all readable blocks for this section
  const sectionBlocks = volume.blocks.filter(
    (b) =>
      b.sectionIndex === sectionIndex &&
      b.kind !== 'scene-break' &&
      b.kind !== 'code' &&
      b.kind !== 'chapter-title'
  );

  const provider = settings.ttsProvider || 'deepgram';
  const voice = settings.ttsVoice || 'aura-asteria-en';
  const maxChunkLength = getProviderMaxChunkLength(provider);

  const allSentences: { blockId: string; sentenceIndex: number; text: string }[] = [];
  for (const block of sectionBlocks) {
    const sList = splitIntoSentences(block.text);
    sList.forEach((st, sIdx) => {
      const trimmed = st.trim();
      if (trimmed) {
        if (trimmed.length > maxChunkLength) {
          const subList = subdivideOversizedSentence(trimmed, maxChunkLength);
          subList.forEach((sub) => {
            allSentences.push({ blockId: block.id, sentenceIndex: sIdx, text: sub });
          });
        } else {
          allSentences.push({ blockId: block.id, sentenceIndex: sIdx, text: trimmed });
        }
      }
    });
  }

  if (allSentences.length === 0) {
    onProgress?.({
      chapterIndex: sectionIndex,
      chapterTitle,
      currentPart: 0,
      totalParts: 0,
      percent: 100,
      status: 'error',
      errorMessage: 'Chapter has no readable text to record.',
    });
    return null;
  }

  // 2. Slice into provider-safe natural chunks

  interface ChapterChunkItem {
    text: string;
    sentences: { blockId: string; sentenceIndex: number; text: string }[];
  }

  const chunks: ChapterChunkItem[] = [];
  let curChunkText = '';
  let curSentences: { blockId: string; sentenceIndex: number; text: string }[] = [];

  for (const s of allSentences) {
    if (curChunkText && curChunkText.length + 1 + s.text.length > maxChunkLength) {
      chunks.push({ text: curChunkText, sentences: curSentences });
      curChunkText = s.text;
      curSentences = [s];
    } else {
      curChunkText = curChunkText ? curChunkText + ' ' + s.text : s.text;
      curSentences.push(s);
    }
  }
  if (curChunkText) {
    chunks.push({ text: curChunkText, sentences: curSentences });
  }

  const totalParts = chunks.length;

  onProgress?.({
    chapterIndex: sectionIndex,
    chapterTitle,
    currentPart: 0,
    totalParts,
    percent: 0,
    status: 'slicing',
  });

  const audioBlobs: Blob[] = [];
  const cues: ChapterAudioCue[] = [];
  let runningTimeSec = 0;

  // 3. Sequentially synthesize each chunk with auto-retry and audio duration cues
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    onProgress?.({
      chapterIndex: sectionIndex,
      chapterTitle,
      currentPart: i + 1,
      totalParts,
      percent: Math.round(((i + 1) / totalParts) * 85),
      status: 'recording',
    });

    try {
      const response = await fetchWithRetry(
        '/api/tts/speak',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: chunk.text,
            provider,
            voice,
          }),
        },
        3,
        1500
      );

      const chunkBlob = await response.blob();
      audioBlobs.push(chunkBlob);

      // Measure duration of synthesized chunk and compute precise sentence cues
      const chunkDur = await getAudioBlobDuration(chunkBlob);
      const totalChars = chunk.text.length || 1;

      let chunkOffset = 0;
      for (const sent of chunk.sentences) {
        const sentDur = (sent.text.length / totalChars) * chunkDur;
        const startSec = runningTimeSec + chunkOffset;
        const endSec = startSec + sentDur;
        cues.push({
          blockId: sent.blockId,
          sentenceIndex: sent.sentenceIndex,
          text: sent.text,
          startSec,
          endSec,
        });
        chunkOffset += sentDur;
      }
      runningTimeSec += chunkDur;
    } catch (err: any) {
      console.error(`Failed to record part ${i + 1}/${totalParts}:`, err);
      onProgress?.({
        chapterIndex: sectionIndex,
        chapterTitle,
        currentPart: i + 1,
        totalParts,
        percent: Math.round(((i + 1) / totalParts) * 85),
        status: 'error',
        errorMessage: err.message || 'TTS synthesis failed after retries',
      });
      return null;
    }
  }

  // 4. Stitch audio chunks into one single continuous MP3
  onProgress?.({
    chapterIndex: sectionIndex,
    chapterTitle,
    currentPart: totalParts,
    totalParts,
    percent: 90,
    status: 'stitching',
  });

  const finalBlob = await stitchAudioBlobs(audioBlobs);

  const metadata: ChapterAudioMetadata = {
    chapterIndex: sectionIndex,
    chapterTitle,
    totalDurationSec: runningTimeSec,
    cues,
    provider,
    voice,
    createdAt: Date.now(),
  };

  // 5. Save directly to the user-selected folder on disk & OPFS
  onProgress?.({
    chapterIndex: sectionIndex,
    chapterTitle,
    currentPart: totalParts,
    totalParts,
    percent: 95,
    status: 'saving',
  });

  const savedFileName = await saveChapterAudioFile(
    volume.title,
    sectionIndex,
    chapterTitle,
    finalBlob,
    metadata
  );

  // Also cache in IndexedDB as backup
  await saveChapterAudio({
    id: `${volume.id}:${sectionIndex}`,
    volumeId: volume.id,
    sectionIndex,
    sectionTitle: chapterTitle,
    audioBlob: finalBlob,
    mimeType: 'audio/mpeg',
    provider,
    voice,
    createdAt: Date.now(),
  }).catch(() => {});

  const url = URL.createObjectURL(finalBlob);
  const fileName = savedFileName || formatChapterFileName(sectionIndex, chapterTitle);

  // If mobile or folder picker unavailable, trigger direct file download to device Downloads folder
  if (!savedFileName && typeof document !== 'undefined') {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  onProgress?.({
    chapterIndex: sectionIndex,
    chapterTitle,
    currentPart: totalParts,
    totalParts,
    percent: 100,
    status: 'done',
  });

  return {
    blob: finalBlob,
    fileName,
    url,
    metadata,
  };
}
