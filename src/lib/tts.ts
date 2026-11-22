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
    previewUrl: '/samples/test_elevenlabs_brian.mp3',
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
    previewUrl: '/samples/test_elevenlabs_alice.mp3',
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

export function splitIntoSentences(text: string): string[] {
  const matches = text.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g);
  if (!matches) return [text];
  return matches.map((s) => s.trim()).filter(Boolean);
}

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && ('speechSynthesis' in window || 'Audio' in window);
}

// In-memory audio URL cache so re-reading the same sentences makes zero duplicate API calls
const audioCache = new Map<string, string>();
let currentAudio: HTMLAudioElement | null = null;
let currentAudioResolve: (() => void) | null = null;

export function stopSpeaking(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
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
}

export interface SpeakOptions {
  provider?: TTSProvider;
  voice?: string;
  speed?: number;
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
      utterance.onend = onEnd;
      utterance.onerror = () => onError?.();
      window.speechSynthesis.speak(utterance);
    } catch {
      onError?.();
    }
    return;
  }

  // AI TTS (Deepgram Aura or ElevenLabs via /api/tts/speak)
  const cacheKey = `${provider}:${voice}:${trimmed}`;
  let audioUrl = audioCache.get(cacheKey);

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
      audioCache.set(cacheKey, audioUrl);
    }

    stopSpeaking();

    const audio = new Audio(audioUrl);
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
  } catch (err) {
    // If network or API fails, smoothly fallback to WebSpeech
    speakSentence(trimmed, { provider: 'webspeech', speed }, onEnd, onError);
  }
}
