import { useEffect, useState } from 'react';
import { getCoverMaterialClass } from '../lib/identity';
import { ColophonMark } from './BookOrnaments';
import type { BookIdentity } from '../types/book';

interface BindingAnimationProps {
  title: string;
  fileCount: number;
  identity: BookIdentity;
  reducedMotion: boolean;
  onComplete: () => void;
}

export function BindingAnimation({
  title,
  fileCount,
  identity,
  reducedMotion,
  onComplete,
}: BindingAnimationProps) {
  const [stage, setStage] = useState<'loose' | 'stack' | 'cover' | 'stamp'>('loose');

  useEffect(() => {
    if (reducedMotion) {
      const done = window.setTimeout(onComplete, 420);
      return () => window.clearTimeout(done);
    }

    const t1 = window.setTimeout(() => setStage('stack'), 280);
    const t2 = window.setTimeout(() => setStage('cover'), 620);
    const t3 = window.setTimeout(() => setStage('stamp'), 960);
    const t4 = window.setTimeout(onComplete, 1380);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.clearTimeout(t4);
    };
  }, [onComplete, reducedMotion]);

  return (
    <div
      className="relative flex flex-col items-center justify-center"
      role="status"
      aria-live="polite"
      aria-label={`Binding ${title} locally in your browser`}
    >
      <div className="relative h-[430px] w-[308px] sm:h-[470px] sm:w-[336px]">
        {/* Loose pages aligning into a neat paper stack */}
        {[0, 1, 2, 3].map((idx) => {
          const offsetX = stage === 'loose' ? (idx - 1.5) * 20 : idx * 1.5;
          const offsetY = stage === 'loose' ? (idx % 2 === 0 ? -16 : 14) : idx * 1.5;
          const rot = stage === 'loose' ? (idx - 1.5) * 4.5 : 0;
          return (
            <div
              key={idx}
              className="absolute inset-2 rounded-[2px] border border-[#D4CBB8] bg-[#F7F3EA] shadow-sm transition-all duration-300 ease-out"
              style={{
                transform: `translate(${offsetX}px, ${offsetY}px) rotate(${rot}deg)`,
                opacity: stage === 'cover' || stage === 'stamp' ? 0.95 : 1,
              }}
            >
              <div className="space-y-3 p-7 opacity-25">
                <div className="h-2 w-2/3 rounded bg-[#4A4035]" />
                <div className="h-1.5 w-full rounded bg-[#4A4035]" />
                <div className="h-1.5 w-11/12 rounded bg-[#4A4035]" />
                <div className="h-1.5 w-4/5 rounded bg-[#4A4035]" />
              </div>
            </div>
          );
        })}

        {/* Bound cover closing over the aligned stack */}
        <div
          className={`absolute inset-0 overflow-hidden rounded-r-[7px] rounded-l-[2px] shadow-2xl transition-all duration-500 ease-out ${getCoverMaterialClass(
            identity.coverMaterial
          )}`}
          style={{
            backgroundColor: identity.coverColor,
            transform:
              stage === 'loose' || stage === 'stack'
                ? 'perspective(1200px) rotateY(-68deg) translateX(-18px)'
                : 'perspective(1200px) rotateY(0deg) translateX(0)',
            transformOrigin: 'left center',
            opacity: stage === 'loose' ? 0 : stage === 'stack' ? 0.35 : 1,
          }}
        >
          {/* Cloth spine band */}
          <div
            className="absolute inset-y-0 left-0 w-7"
            style={{
              backgroundColor: identity.spineColor,
              boxShadow: 'inset -2px 0 6px rgba(0,0,0,0.22)',
            }}
          />

          {/* Embossed / paper label title */}
          <div
            className="relative flex h-full flex-col items-center justify-center px-10 pl-14 text-center transition-opacity duration-300"
            style={{ opacity: stage === 'stamp' ? 1 : 0.08 }}
          >
            <div className="mb-5 opacity-75">
              <ColophonMark symbol={identity.symbol} color={identity.inkOnCover} size={22} />
            </div>
            <div
              className="rounded-[2px] px-5 py-4"
              style={
                identity.titleTreatment === 'paper-label'
                  ? {
                      backgroundColor: '#F4EFE4',
                      color: '#25201B',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                    }
                  : { color: identity.inkOnCover }
              }
            >
              <p className="font-hand-kalam text-xl leading-snug">{title}</p>
            </div>
            <p
              className="mt-6 font-hand-kalam text-xs tracking-wide opacity-65"
              style={{ color: identity.inkOnCover }}
            >
              {fileCount > 1 ? `Binding ${fileCount} local documents…` : 'Bound in this browser'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
