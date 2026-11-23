/**
 * Chapter Recorder & Audio Stitcher
 * Splits long chapters into provider-safe prose chunks, synthesizes them sequentially
 * with the exact same voice model, stitches them into a single seamless .mp3 file,
 * and saves it directly to the user-selected folder on disk.
 */

import type { BookVolume, ReaderSettings, TTSProvider } from '../types/book';
import { splitIntoSentences } from './tts';
import { saveChapterAudioFile } from './fileSystemStorage';
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
    case 'fish':
      return 2500; // Fish Audio recommended chunk size
    case 'elevenlabs':
      return 4500; // ElevenLabs Turbo handles up to 40k, 4.5k is optimal for cadence
    case 'deepgram':
    default:
      return 1800; // Deepgram Aura optimal prose chunk
  }
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

/**
 * Concatenates multiple MP3 blobs into a single continuous MP3 Blob
 */
export async function stitchAudioBlobs(blobs: Blob[]): Promise<Blob> {
  if (blobs.length === 0) {
    return new Blob([], { type: 'audio/mpeg' });
  }
  if (blobs.length === 1) {
    return blobs[0];
  }

  const arrayBuffers = await Promise.all(blobs.map((b) => b.arrayBuffer()));
  let totalLength = 0;
  for (const buf of arrayBuffers) {
    totalLength += buf.byteLength;
  }

  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of arrayBuffers) {
    merged.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  }

  return new Blob([merged], { type: 'audio/mpeg' });
}

export async function recordChapterAudio(
  volume: BookVolume,
  sectionIndex: number,
  settings: ReaderSettings,
  onProgress?: (progress: ChapterRecordingProgress) => void
): Promise<{ blob: Blob; fileName: string; url: string } | null> {
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

  const fullText = sectionBlocks.map((b) => b.text).join('\n\n');
  if (!fullText.trim()) {
    onProgress?.({
      chapterIndex: sectionIndex,
      chapterTitle,
      currentPart: 0,
      totalParts: 0,
      percent: 100,
      status: 'error',
      errorMessage: 'Chapter has no text to record.',
    });
    return null;
  }

  // 2. Slice into provider-safe natural chunks
  const provider = settings.ttsProvider || 'deepgram';
  const voice = settings.ttsVoice || 'aura-asteria-en';
  const maxChunkLength = getProviderMaxChunkLength(provider);
  const chunks = sliceTextIntoNaturalChunks(fullText, maxChunkLength);
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

  // 3. Sequentially synthesize each chunk with the exact same voice
  for (let i = 0; i < chunks.length; i++) {
    const chunkText = chunks[i];
    onProgress?.({
      chapterIndex: sectionIndex,
      chapterTitle,
      currentPart: i + 1,
      totalParts,
      percent: Math.round(((i + 1) / totalParts) * 85),
      status: 'recording',
    });

    try {
      const response = await fetch('/api/tts/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: chunkText,
          provider,
          voice,
        }),
      });

      if (!response.ok) {
        throw new Error(`TTS server responded with ${response.status}`);
      }

      const chunkBlob = await response.blob();
      audioBlobs.push(chunkBlob);
    } catch (err: any) {
      console.error(`Failed to record part ${i + 1}/${totalParts}:`, err);
      onProgress?.({
        chapterIndex: sectionIndex,
        chapterTitle,
        currentPart: i + 1,
        totalParts,
        percent: Math.round(((i + 1) / totalParts) * 85),
        status: 'error',
        errorMessage: err.message || 'TTS synthesis failed',
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

  // 5. Save directly to the user-selected folder on disk
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
    finalBlob
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
    fileName: savedFileName || `${chapterTitle}.mp3`,
    url,
  };
}
