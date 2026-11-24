import type { TTSAudioMode, TTSProvider, TTSVoiceOption } from '../types/book';
import { loadAudioBlob, saveAudioBlob } from './storage';

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
    id: 'fish-s2-pro',
    provider: 'fish',
    voice: 's2.1-pro-free',
    name: 'Fish Audio S2.1 (Adrian)',
    gender: 'Male',
    style: 'Studio Audiobook Narration',
    costCategory: 'Cost-Effective',
    allowanceInfo: '50 Free Generations/Day + $1.00 Credit Active',
    previewUrl: '/samples/fish_adrian.mp3',
    description: 'Ultra-realistic studio voice with natural cadence and nuance.',
  },
  {
    id: 'groq-orpheus',
    provider: 'groq',
    voice: 'canopylabs/orpheus-v1-english',
    name: 'Groq Orpheus (Autumn)',
    gender: 'Female',
    style: 'Expressive Conversational',
    costCategory: 'Cost-Effective',
    allowanceInfo: 'Free Tier Available on Groq (Instant synthesis)',
    previewUrl: '/samples/groq_autumn.mp3',
    description: 'Ultra-low-latency neural voice hosted on Groq LPU engine.',
  },
  {
    id: 'webspeech-edge-natural',
    provider: 'webspeech',
    voice: 'edge-natural',
    name: 'Edge Natural / OS Neural Voice',
    gender: 'Neutral',
    style: 'Natural Browser Synthesizer',
    costCategory: 'Device Default',
    allowanceInfo: 'Completely Offline & Unlimited (Zero API calls)',
    previewUrl: '',
    description: 'Uses Edge Online Natural or Google/Apple neural voices without API keys.',
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
    // Non-destructive fallback regex that preserves all text, quotes, and punctuation without truncation
    const matches = text.match(/.+?(?:[.!?]+(?=[\x27"”’)]*(?:\s|$))[\x27"”’)]*|$)/gs);
    rawSegments = matches?.filter((s) => s.trim().length > 0) || [text];
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
let currentUtterance: SpeechSynthesisUtterance | null = null;
let currentAudioResolve: (() => void) | null = null;
let isSpeakingPausedState = false;
let activeSpeakToken = 0;
let activeFetchController: AbortController | null = null;

export function isSpeakingPaused(): boolean {
  return isSpeakingPausedState;
}

export function getPersistentAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (!persistentAudio) {
    persistentAudio = new Audio();
  }
  return persistentAudio;
}

export function setCurrentAudio(audio: HTMLAudioElement | null): void {
  currentAudio = audio;
}

const SILENT_WAV_BASE64 =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

export function unlockAudioOnUserGesture(): void {
  if (typeof window === 'undefined') return;
  const audio = getPersistentAudio();
  if (!audio) return;
  // Play silent buffer to acquire or renew mobile browser playback gesture
  if (audio.paused && (!audio.src || audio.src.startsWith('data:audio/wav;base64'))) {
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
  onPause?: () => void,
  onPrev?: () => void,
  onNext?: () => void
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

    if (onPrev) {
      navigator.mediaSession.setActionHandler('previoustrack', onPrev);
    } else {
      try {
        navigator.mediaSession.setActionHandler('previoustrack', null);
      } catch {}
    }

    if (onNext) {
      navigator.mediaSession.setActionHandler('nexttrack', onNext);
    } else {
      try {
        navigator.mediaSession.setActionHandler('nexttrack', null);
      } catch {}
    }
  } catch {
    // Ignore unsupported media session actions
  }
}

export function stopSpeaking(): void {
  activeSpeakToken++;
  isSpeakingPausedState = false;

  if (activeFetchController) {
    try {
      activeFetchController.abort();
    } catch {}
    activeFetchController = null;
  }

  if (currentUtterance) {
    currentUtterance.onend = null;
    currentUtterance.onerror = null;
    currentUtterance = null;
  }

  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio.onended = null;
    currentAudio.onerror = null;
    currentAudio = null;
  }
  if (persistentAudio && persistentAudio !== currentAudio) {
    persistentAudio.pause();
    persistentAudio.currentTime = 0;
    persistentAudio.onended = null;
    persistentAudio.onerror = null;
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
  isSpeakingPausedState = true;
  if (currentAudio) {
    currentAudio.pause();
  }
  if (persistentAudio) {
    persistentAudio.pause();
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
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
  isSpeakingPausedState = false;
  if (currentAudio) {
    currentAudio.play().catch(() => {});
  } else if (persistentAudio && persistentAudio.src) {
    persistentAudio.play().catch(() => {});
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

export function findBestNaturalSpeechVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  // 1. Edge Online / Natural voices (highest quality neural browser voices)
  const edgeNatural = voices.find(
    (v) => (v.name.includes('Natural') || v.name.includes('Online')) && v.lang.startsWith('en')
  );
  if (edgeNatural) return edgeNatural;

  // 2. Google US / UK English natural voices
  const googleNatural = voices.find(
    (v) => (v.name.includes('Google') || v.name.includes('Natural')) && v.lang.startsWith('en')
  );
  if (googleNatural) return googleNatural;

  // 3. Apple Enhanced / Siri voices
  const appleEnhanced = voices.find(
    (v) =>
      (v.name.includes('Enhanced') ||
        v.name.includes('Siri') ||
        v.name.includes('Samantha') ||
        v.name.includes('Daniel') ||
        v.name.includes('Karen')) &&
      v.lang.startsWith('en')
  );
  if (appleEnhanced) return appleEnhanced;

  // 4. Any English voice
  const anyEnglish = voices.find((v) => v.lang.startsWith('en'));
  if (anyEnglish) return anyEnglish;

  // 5. Default
  return voices.find((v) => v.default) || voices[0] || null;
}

export interface BrowserVoiceOption {
  name: string;
  lang: string;
  default: boolean;
  isNatural: boolean;
}

export function getBrowserSpeechVoices(): BrowserVoiceOption[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  return window.speechSynthesis.getVoices().map((v) => ({
    name: v.name,
    lang: v.lang,
    default: v.default,
    isNatural: v.name.includes('Natural') || v.name.includes('Online') || v.name.includes('Enhanced'),
  }));
}

export interface SpeakOptions {
  provider?: TTSProvider;
  voice?: string;
  speed?: number;
  title?: string;
  author?: string;
  volumeId?: string;
  audioMode?: TTSAudioMode; // 'recorded' (default) or 'live'
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

  const speakToken = ++activeSpeakToken;
  const provider = options.provider || 'deepgram';
  const voice = options.voice || 'aura-asteria-en';
  const speed = options.speed || 1.0;
  const audioMode = options.audioMode || 'recorded'; // Default is recorded/cached

  // Cancel previous fetch controller if still running
  if (activeFetchController) {
    try {
      activeFetchController.abort();
    } catch {}
    activeFetchController = null;
  }

  // Clear any existing utterance
  if (currentUtterance) {
    currentUtterance.onend = null;
    currentUtterance.onerror = null;
    currentUtterance = null;
  }

  // Stop any audio element currently playing
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio.onended = null;
    currentAudio.onerror = null;
    currentAudio = null;
  }

  syncMediaSessionMetadata(
    options.title || trimmed.slice(0, 40),
    options.author,
    options.onPlay,
    options.onPause
  );

  // WebSpeech Fallback / Native mode
  if (provider === 'webspeech') {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      if (speakToken === activeSpeakToken) onError?.();
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(trimmed);
      currentUtterance = utterance;
      utterance.rate = speed * 0.95;
      utterance.pitch = 1.0;

      // Select exact selected voice or best natural voice
      const allVoices = window.speechSynthesis.getVoices();
      const matchedVoice = voice ? allVoices.find((v) => v.name === voice) : null;
      const naturalVoice = matchedVoice || findBestNaturalSpeechVoice();
      if (naturalVoice) {
        utterance.voice = naturalVoice;
      }

      utterance.onend = () => {
        if (currentUtterance === utterance) {
          currentUtterance = null;
        }
        if (speakToken !== activeSpeakToken) return;
        if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
          try {
            navigator.mediaSession.playbackState = 'none';
          } catch {}
        }
        onEnd();
      };
      utterance.onerror = () => {
        if (currentUtterance === utterance) {
          currentUtterance = null;
        }
        if (speakToken !== activeSpeakToken) return;
        onError?.();
      };
      window.speechSynthesis.speak(utterance);
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        try {
          navigator.mediaSession.playbackState = 'playing';
        } catch {}
      }
    } catch {
      if (speakToken === activeSpeakToken) onError?.();
    }
    return;
  }

  // AI TTS (Deepgram Aura or ElevenLabs via /api/tts/speak)
  const cacheKey = `${provider}:${voice}:${trimmed}`;
  let audioUrl = getCachedAudio(cacheKey);

  try {
    // 1. If in Recorded mode (default) and not yet in memory, check persistent IndexedDB
    if (!audioUrl && audioMode !== 'live') {
      const persistedBlob = await loadAudioBlob(cacheKey);
      if (speakToken !== activeSpeakToken) return;
      if (persistedBlob) {
        audioUrl = URL.createObjectURL(persistedBlob);
        setCachedAudio(cacheKey, audioUrl);
      }
    }

    // 2. If still no audio, fetch from live API
    if (!audioUrl) {
      const safeText = trimmed.length > 1800 ? trimmed.slice(0, 1800) : trimmed;
      const controller = new AbortController();
      activeFetchController = controller;

      const response = await fetch('/api/tts/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: safeText,
          provider,
          voice,
        }),
        signal: controller.signal,
      });

      if (speakToken !== activeSpeakToken) return;

      if (!response.ok) {
        throw new Error(`TTS server responded with ${response.status}`);
      }

      const blob = await response.blob();
      if (speakToken !== activeSpeakToken) return;

      audioUrl = URL.createObjectURL(blob);
      setCachedAudio(cacheKey, audioUrl);

      // Record audio into persistent IndexedDB so all future replays are free & offline
      if (audioMode !== 'live') {
        saveAudioBlob(cacheKey, options.volumeId || 'global', blob, { provider, voice }).catch(() => {});
      }
    }

    if (speakToken !== activeSpeakToken) return;

    // Check if user paused or stopped while network fetch or DB read was in-flight
    if (isSpeakingPausedState) {
      const audio = getPersistentAudio() || new Audio();
      audio.src = audioUrl;
      audio.playbackRate = speed;
      currentAudio = audio;
      audio.onended = () => {
        if (currentAudio === audio) {
          currentAudio = null;
        }
        if (speakToken === activeSpeakToken) onEnd();
      };
      audio.onerror = () => {
        if (currentAudio === audio) {
          currentAudio = null;
        }
        if (speakToken === activeSpeakToken) {
          speakSentence(trimmed, { ...options, provider: 'webspeech' }, onEnd, onError);
        }
      };
      return;
    }

    stopSpeaking();
    activeSpeakToken = speakToken; // preserve this sentence's token across internal audio reset

    const audio = getPersistentAudio() || new Audio();
    audio.src = audioUrl;
    audio.playbackRate = speed;
    currentAudio = audio;

    audio.onended = () => {
      if (currentAudio === audio) {
        currentAudio = null;
      }
      if (speakToken === activeSpeakToken) onEnd();
    };

    audio.onerror = () => {
      if (currentAudio === audio) {
        currentAudio = null;
      }
      // Fallback to WebSpeech with high-quality natural voice on audio error
      if (speakToken === activeSpeakToken) {
        speakSentence(trimmed, { ...options, provider: 'webspeech' }, onEnd, onError);
      }
    };

    if (!isSpeakingPausedState && speakToken === activeSpeakToken) {
      await audio.play();
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        try {
          navigator.mediaSession.playbackState = 'playing';
        } catch {}
      }
    }
  } catch (err: any) {
    if (err?.name === 'AbortError' || speakToken !== activeSpeakToken) {
      return;
    }
    // If network or API fails, smoothly fallback to WebSpeech with natural voice
    speakSentence(trimmed, { ...options, provider: 'webspeech' }, onEnd, onError);
  }
}
