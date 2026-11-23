import type { TTSProvider, TTSVoiceOption } from '../types/book';

export interface SentenceCue {
  blockId: string;
  sentenceIndex: number;
  text: string;
}

export const TTS_VOICE_CATALOG: TTSVoiceOption[] = [
  {
    id: 'deepgram-asteria',
    provider: 'deepgram',
    voice: 'aura-asteria-en',
    name: 'Asteria (Primary)',
    gender: 'Female',
    style: 'Warm & Natural Prose',
    costCategory: 'Ultra-Cheap (Primary)',
    allowanceInfo: '$200 Free Sign-Up Credit (~13,333,000 characters / ~100 hours)',
    previewUrl: '/samples/deepgram_asteria.mp3',
    description: 'Fast, natural, and conversational cadence ideal for long novels and essays.',
  },
  {
    id: 'deepgram-luna',
    provider: 'deepgram',
    voice: 'aura-luna-en',
    name: 'Luna',
    gender: 'Female',
    style: 'Calm & Articulate',
    costCategory: 'Ultra-Cheap (Primary)',
    allowanceInfo: '$200 Free Sign-Up Credit (~13,333,000 characters / ~100 hours)',
    previewUrl: '/samples/deepgram_luna.mp3',
    description: 'Serene tone with distinct punctuation pauses, great for bedtime reading.',
  },
  {
    id: 'deepgram-orion',
    provider: 'deepgram',
    voice: 'aura-orion-en',
    name: 'Orion',
    gender: 'Male',
    style: 'Deep & Resonant',
    costCategory: 'Ultra-Cheap (Primary)',
    allowanceInfo: '$200 Free Sign-Up Credit (~13,333,000 characters / ~100 hours)',
    previewUrl: '/samples/deepgram_orion.mp3',
    description: 'Rich, grounded baritone voice for historical fiction, mystery, and philosophy.',
  },
  {
    id: 'deepgram-arcas',
    provider: 'deepgram',
    voice: 'aura-arcas-en',
    name: 'Arcas',
    gender: 'Male',
    style: 'Expressive Storyteller',
    costCategory: 'Ultra-Cheap (Primary)',
    allowanceInfo: '$200 Free Sign-Up Credit (~13,333,000 characters / ~100 hours)',
    previewUrl: '/samples/deepgram_arcas.mp3',
    description: 'Dynamic pacing and dramatic range suited for dialogue and adventure books.',
  },
  {
    id: 'elevenlabs-brian',
    provider: 'elevenlabs',
    voice: 'nPczCjzI2devNBz1zQrb',
    name: 'Brian',
    gender: 'Male',
    style: 'British Classical Narrator',
    costCategory: 'High-Fidelity',
    allowanceInfo: '10,000 Characters Free Every Month (Recurring free tier)',
    previewUrl: '/samples/elevenlabs_brian.mp3',
    description: 'Audiobook-grade BBC-style British narration with lifelike nuance.',
  },
  {
    id: 'elevenlabs-alice',
    provider: 'elevenlabs',
    voice: 'Xb7hH8MSUJpSbSDYk0k2',
    name: 'Alice',
    gender: 'Female',
    style: 'Confident & Literary',
    costCategory: 'High-Fidelity',
    allowanceInfo: '10,000 Characters Free Every Month (Recurring free tier)',
    previewUrl: '/samples/elevenlabs_alice.mp3',
    description: 'Clear, elegant narrative tone with delicate cadence shifts.',
  },
  {
    id: 'webspeech-default',
    provider: 'webspeech',
    voice: 'device-default',
    name: 'Device Native Voice',
    gender: 'Neutral',
    style: 'Local Synthesizer',
    costCategory: 'Device Default',
    allowanceInfo: 'Completely Offline & Unlimited (Zero API calls)',
    previewUrl: '',
    description: 'Local operating system TTS engine when offline or disconnected.',
  },
];

const COMMON_ABBREVIATIONS = new Set([
  'mr.', 'mrs.', 'ms.', 'dr.', 'prof.', 'sr.', 'jr.', 'vs.', 'etc.',
  'e.g.', 'i.e.', 'st.', 'vol.', 'p.', 'pp.', 'no.', 'ch.', 'gen.', 'rep.', 'sen.'
]);

export function splitIntoSentences(text: string): string[] {
  if (!text || !text.trim()) return [];

  let rawSegments: string[];
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
    rawSegments = Array.from(segmenter.segment(text), (s) => s.segment);
  } else {
    // Non-destructive fallback regex that preserves all text, quotes, and punctuation
    const matches = text.match(/[^.!?]+(?:[.!?]+(?:['"”’)]+|\s+|$)|$)/g);
    rawSegments = matches || [text];
  }

  const result: string[] = [];
  let buffer = '';

  for (let i = 0; i < rawSegments.length; i++) {
    const seg = rawSegments[i].trim();
    if (!seg) continue;

    if (!buffer) {
      buffer = seg;
    } else {
      const words = buffer.split(/\s+/);
      const rawLast = words[words.length - 1] || '';
      const lastWord = rawLast.toLowerCase().replace(/^["'“”‘’)]+|["'“”‘’)]+$/g, '');
      const startsWithLower = /^[a-z]/.test(seg);

      // Merge if previous segment ended in an abbreviation or if current segment starts with lowercase (e.g. dialogue tag "he said")
      if ((lastWord && COMMON_ABBREVIATIONS.has(lastWord)) || startsWithLower) {
        buffer += ' ' + seg;
      } else {
        result.push(buffer);
        buffer = seg;
      }
    }
  }
  if (buffer) result.push(buffer);
  return result;
}

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && ('speechSynthesis' in window || 'Audio' in window);
}

// In-memory audio URL cache so re-reading the same sentences makes zero duplicate API calls
// Bounded to 25 items on mobile to prevent memory bloat, revoking evicted ObjectURLs
const MAX_AUDIO_CACHE_SIZE = 25;
const audioCache = new Map<string, string>();
let persistentAudio: HTMLAudioElement | null = null;
let currentAudio: HTMLAudioElement | null = null;
let currentAudioResolve: (() => void) | null = null;

export function getPersistentAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (!persistentAudio) {
    persistentAudio = new Audio();
  }
  return persistentAudio;
}

const SILENT_WAV_BASE64 =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

export function unlockAudioOnUserGesture(): void {
  if (typeof window === 'undefined') return;
  const audio = getPersistentAudio();
  if (!audio) return;
  // Play silent buffer to acquire mobile browser playback permission
  if (audio.paused && !audio.src) {
    audio.src = SILENT_WAV_BASE64;
    audio.play().catch(() => {});
  }
}

function getCachedAudio(key: string): string | undefined {
  const url = audioCache.get(key);
  if (url) {
    // Refresh LRU order
    audioCache.delete(key);
    audioCache.set(key, url);
  }
  return url;
}

function setCachedAudio(key: string, url: string): void {
  if (audioCache.has(key)) {
    audioCache.delete(key);
  } else if (audioCache.size >= MAX_AUDIO_CACHE_SIZE) {
    const oldestKey = audioCache.keys().next().value;
    if (oldestKey) {
      const oldestUrl = audioCache.get(oldestKey);
      if (oldestUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        try {
          URL.revokeObjectURL(oldestUrl);
        } catch {
          // ignore
        }
      }
      audioCache.delete(oldestKey);
    }
  }
  audioCache.set(key, url);
}

export function syncMediaSessionMetadata(
  title: string,
  author?: string,
  onPlay?: () => void,
  onPause?: () => void
): void {
  if (typeof window === 'undefined' || !('mediaSession' in navigator)) return;
  try {
    if (typeof MediaMetadata !== 'undefined') {
      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist: author || 'The Quiet Volume',
        album: 'The Quiet Volume',
      });
    }

    navigator.mediaSession.setActionHandler('play', () => {
      if (onPlay) {
        onPlay();
      } else {
        resumeSpeaking();
      }
    });

    navigator.mediaSession.setActionHandler('pause', () => {
      if (onPause) {
        onPause();
      } else {
        pauseSpeaking();
      }
    });

    navigator.mediaSession.setActionHandler('stop', () => {
      stopSpeaking();
      onPause?.();
    });
  } catch {
    // Ignore unsupported media session actions
  }
}

export function stopSpeaking(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio.onended = null;
    currentAudio.onerror = null;
    currentAudio = null;
  }
  if (currentAudioResolve) {
    currentAudioResolve();
    currentAudioResolve = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
    try {
      navigator.mediaSession.playbackState = 'none';
    } catch {
      // ignore
    }
  }
}

export function pauseSpeaking(): void {
  if (currentAudio) {
    currentAudio.pause();
  } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.pause();
    } catch {
      // ignore
    }
  }
  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
    try {
      navigator.mediaSession.playbackState = 'paused';
    } catch {
      // ignore
    }
  }
}

export function resumeSpeaking(): void {
  if (currentAudio) {
    currentAudio.play().catch(() => {});
  } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.resume();
    } catch {
      // ignore
    }
  }
  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
    try {
      navigator.mediaSession.playbackState = 'playing';
    } catch {
      // ignore
    }
  }
}

export interface SpeakOptions {
  provider?: TTSProvider;
  voice?: string;
  speed?: number;
  title?: string;
  author?: string;
  onPlay?: () => void;
  onPause?: () => void;
}

export async function speakSentence(
  text: string,
  options: SpeakOptions,
  onEnd: () => void,
  onError?: () => void
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) {
    onEnd();
    return;
  }

  const provider = options.provider || 'deepgram';
  const voice = options.voice || 'aura-asteria-en';
  const speed = options.speed || 1.0;

  syncMediaSessionMetadata(
    options.title || trimmed.slice(0, 40),
    options.author,
    options.onPlay,
    options.onPause
  );

  // WebSpeech Fallback
  if (provider === 'webspeech') {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      onError?.();
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(trimmed);
      utterance.rate = speed * 0.95;
      utterance.pitch = 1.0;
      utterance.onend = () => {
        if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
          try {
            navigator.mediaSession.playbackState = 'none';
          } catch {}
        }
        onEnd();
      };
      utterance.onerror = () => onError?.();
      window.speechSynthesis.speak(utterance);
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        try {
          navigator.mediaSession.playbackState = 'playing';
        } catch {}
      }
    } catch {
      onError?.();
    }
    return;
  }

  // AI TTS (Deepgram Aura or ElevenLabs via /api/tts/speak)
  const cacheKey = `${provider}:${voice}:${trimmed}`;
  let audioUrl = getCachedAudio(cacheKey);

  try {
    if (!audioUrl) {
      const response = await fetch('/api/tts/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: trimmed,
          provider,
          voice,
        }),
      });

      if (!response.ok) {
        throw new Error(`TTS server responded with ${response.status}`);
      }

      const blob = await response.blob();
      audioUrl = URL.createObjectURL(blob);
      setCachedAudio(cacheKey, audioUrl);
    }

    stopSpeaking();

    const audio = getPersistentAudio() || new Audio();
    audio.src = audioUrl;
    audio.playbackRate = speed;
    currentAudio = audio;

    audio.onended = () => {
      if (currentAudio === audio) {
        currentAudio = null;
      }
      onEnd();
    };

    audio.onerror = () => {
      if (currentAudio === audio) {
        currentAudio = null;
      }
      // Fallback to WebSpeech on audio playback error
      speakSentence(trimmed, { provider: 'webspeech', speed }, onEnd, onError);
    };

    await audio.play();
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = 'playing';
      } catch {}
    }
  } catch (err) {
    // If network or API fails, smoothly fallback to WebSpeech
    speakSentence(trimmed, { provider: 'webspeech', speed }, onEnd, onError);
  }
}
