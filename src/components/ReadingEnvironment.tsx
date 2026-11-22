import React, { useEffect, useState } from 'react';
import { extractFilesFromDataTransfer } from '../lib/fileImporter';
import { getEnvironmentSpec, getLightingSpec } from '../lib/lighting';
import type { EnvironmentSurface, LightingMode } from '../types/book';

interface ReadingEnvironmentProps {
  environment: EnvironmentSurface;
  lighting: LightingMode;
  reducedTexture: boolean;
  isDraggingFiles: boolean;
  onDragFilesChange: (dragging: boolean) => void;
  onDropFiles: (files: File[], folderName?: string) => void;
  children: React.ReactNode;
}

export function ReadingEnvironment({
  environment,
  lighting,
  reducedTexture,
  isDraggingFiles,
  onDragFilesChange,
  onDropFiles,
  children,
}: ReadingEnvironmentProps) {
  const envSpec = getEnvironmentSpec(environment);
  const lightSpec = getLightingSpec(lighting);
  const [imageFailed, setImageFailed] = useState(false);
  const [sessionDrift, setSessionDrift] = useState(0);

  // Subtle ambient passage of time: very slow, barely perceptible drift over long sessions
  useEffect(() => {
    const start = Date.now();
    const timer = window.setInterval(() => {
      const minutes = (Date.now() - start) / 60000;
      setSessionDrift(Math.min(1, minutes / 45));
    }, 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setImageFailed(false);
  }, [environment]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingFiles) onDragFilesChange(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    onDragFilesChange(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDragFilesChange(false);
    const { files, folderName } = await extractFilesFromDataTransfer(e.dataTransfer);
    if (files.length > 0) {
      onDropFiles(files, folderName);
    }
  };

  const driftFilter =
    lighting === 'night-light'
      ? `brightness(${1 - sessionDrift * 0.06})`
      : lighting === 'daylight'
      ? `hue-rotate(${sessionDrift * 3}deg)`
      : undefined;

  return (
    <div
      className="relative h-full w-full overflow-hidden select-none"
      style={{ background: envSpec.fallbackBg }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-environment={environment}
      data-lighting={lighting}
    >
      {/* Table Surface Layer */}
      {!reducedTexture && envSpec.imageUrl && !imageFailed ? (
        <img
          src={envSpec.imageUrl}
          alt=""
          aria-hidden="true"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
          className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
            envSpec.imageScale || 'scale-110'
          }`}
          style={{
            objectPosition: envSpec.imagePosition || 'center',
            filter: driftFilter,
          }}
        />
      ) : (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 transition-colors duration-700 ${
            !reducedTexture && envSpec.className ? envSpec.className : ''
          }`}
          style={{
            background: envSpec.className ? undefined : envSpec.fallbackBg,
          }}
        />
      )}

      {/* Room Illumination Veil (separate from paper stock) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-all duration-1000"
        style={{ background: lightSpec.roomOverlay }}
      />

      {/* Ambient directional light glow */}
      {!reducedTexture && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 transition-opacity duration-1000"
          style={{ background: lightSpec.ambientGlow }}
        />
      )}

      {/* Quiet drag-over table cue */}
      {isDraggingFiles && (
        <div
          aria-live="polite"
          className="pointer-events-none fixed inset-6 z-40 flex items-center justify-center rounded-sm border border-dashed border-[#E8DFCE]/55 bg-black/20 backdrop-blur-[1px] transition-opacity duration-200"
        >
          <p className="font-hand-kalam text-2xl tracking-wide text-[#F5EFE2] drop-shadow">
            Release onto the table to bind locally
          </p>
        </div>
      )}

      {/* Central viewport stage — book sits slightly below vertical center on desktop */}
      <main className="relative z-10 flex h-full w-full items-center justify-center sm:pt-5">
        {children}
      </main>
    </div>
  );
}
