import { useState } from 'react';
import { formatShortDate } from '../lib/parser';
import { ColophonMark } from './BookOrnaments';
import type { BookVolume } from '../types/book';
import type { PaperSpec } from '../lib/lighting';

interface FinalEndpaperPageProps {
  volume: BookVolume;
  paper: PaperSpec;
  onSaveFinalThought: (thought: string) => void;
  onCloseBook: () => void;
  onOpenBackCover: () => void;
}

export function FinalEndpaperPage({
  volume,
  paper,
  onSaveFinalThought,
  onCloseBook,
  onOpenBackCover,
}: FinalEndpaperPageProps) {
  const [thought, setThought] = useState(volume.finalThought || '');
  const finishedDate = formatShortDate(volume.finishedAt || Date.now());

  return (
    <div
      className="flex h-full w-full flex-col items-center justify-between px-8 py-12 sm:px-14 sm:py-16 text-center"
      style={{ color: paper.ink }}
    >
      <div className="pt-2 opacity-50">
        <ColophonMark symbol={volume.identity.symbol} color={paper.ink} size={20} />
      </div>

      <div className="w-full max-w-xs space-y-6">
        <p className="font-hand-kalam text-xl sm:text-2xl leading-snug">
          Finished on {finishedDate}.
        </p>

        <div className="text-left">
          <label
            htmlFor="final-thought-input"
            className="block font-hand-patrick text-xs mb-1.5"
            style={{ color: paper.pencilInk }}
          >
            Leave one final thought (optional)
          </label>
          <textarea
            id="final-thought-input"
            rows={3}
            value={thought}
            onChange={(e) => setThought(e.target.value)}
            onBlur={() => onSaveFinalThought(thought.trim())}
            placeholder="Write a closing line in pencil…"
            className="w-full resize-none border-b bg-transparent py-1.5 font-hand-kalam text-sm leading-relaxed placeholder:opacity-45 focus:outline-none"
            style={{
              borderColor: `${paper.ink}28`,
              color: paper.ink,
            }}
          />
        </div>
      </div>

      <div className="flex items-center gap-6 font-hand-kalam text-sm">
        <button
          type="button"
          onClick={() => {
            onSaveFinalThought(thought.trim());
            onCloseBook();
          }}
          className="underline decoration-dotted underline-offset-4 transition-opacity hover:opacity-70"
          style={{ color: paper.ink }}
        >
          Close this volume
        </button>
        <button
          type="button"
          onClick={() => {
            onSaveFinalThought(thought.trim());
            onOpenBackCover();
          }}
          className="underline decoration-dotted underline-offset-4 opacity-70 transition-opacity hover:opacity-100"
          style={{ color: paper.pencilInk }}
        >
          Settings book
        </button>
      </div>
    </div>
  );
}
