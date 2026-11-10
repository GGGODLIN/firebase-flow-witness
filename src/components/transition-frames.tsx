'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import type { BoundingBox } from '../core/flow-witness-engine.ts';
import { cx, Eyebrow } from './ui.tsx';

interface RgbaCanvasProps {
  readonly rgba: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly label: string;
  // Letterbox inside the parent box instead of sizing the box to the image.
  readonly contain?: boolean;
}

export function RgbaCanvas({ rgba, width, height, label, contain }: RgbaCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const context = canvasRef.current?.getContext('2d');
    if (!context) {
      return;
    }
    context.clearRect(0, 0, width, height);
    context.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  }, [rgba, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      role="img"
      aria-label={label}
      className={contain ? 'block h-full w-full object-contain' : 'block h-auto w-full'}
    />
  );
}

export type RegionState = 'open' | 'melted' | 'cleared';

interface RegionOverlayProps {
  readonly regions: readonly BoundingBox[];
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly state: RegionState;
}

export function RegionOverlay({ regions, frameWidth, frameHeight, state }: RegionOverlayProps) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {regions.map((region, index) => (
        <div
          key={region.id}
          className={cx(
            'fw-region absolute rounded-[3px] border',
            state === 'open' && 'border-rose-400 bg-rose-500/10 shadow-[0_0_0_1px_rgba(251,113,133,0.35),0_0_18px_rgba(251,113,133,0.25)]',
            state === 'melted' && 'fw-region--melted border-emerald-300',
            state === 'cleared' && 'fw-region--cleared border-emerald-300',
          )}
          style={{
            left: `${(region.x / frameWidth) * 100}%`,
            top: `${(region.y / frameHeight) * 100}%`,
            width: `${(region.width / frameWidth) * 100}%`,
            height: `${(region.height / frameHeight) * 100}%`,
          }}
        >
          <span className="absolute -left-px -top-4 rounded-t-[3px] bg-rose-500 px-1 font-mono text-[9px] font-bold leading-4 text-white">
            {index + 1}
          </span>
        </div>
      ))}
    </div>
  );
}

interface TransitionFrameProps {
  readonly title: string;
  readonly meta?: ReactNode;
  readonly accent: 'slate' | 'amber' | 'rose' | 'emerald' | 'cyan';
  readonly rgba: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly label: string;
  readonly overlay?: ReactNode;
  readonly checkerboard?: boolean;
  // CSS aspect-ratio of the display box; set it so frames in one row share a height.
  readonly boxAspect?: string;
}

const ACCENT_BORDER: Record<TransitionFrameProps['accent'], string> = {
  slate: 'border-white/10',
  amber: 'border-amber-400/40',
  rose: 'border-rose-400/40',
  emerald: 'border-emerald-400/50',
  cyan: 'border-cyan-400/40',
};

export function TransitionFrame({
  title,
  meta,
  accent,
  rgba,
  width,
  height,
  label,
  overlay,
  checkerboard,
  boxAspect,
}: TransitionFrameProps) {
  return (
    <figure
      className={cx(
        'overflow-hidden rounded-lg border bg-slate-950/70 transition-colors duration-500',
        ACCENT_BORDER[accent],
      )}
    >
      <figcaption className="flex items-center justify-between gap-2 border-b border-white/5 px-2.5 py-1.5">
        <Eyebrow className="text-slate-400">{title}</Eyebrow>
        {meta ? <span className="truncate font-mono text-[10px] text-slate-500">{meta}</span> : null}
      </figcaption>
      <div
        className={cx('relative', checkerboard && 'fw-checker')}
        style={boxAspect ? { aspectRatio: boxAspect } : undefined}
      >
        <RgbaCanvas
          rgba={rgba}
          width={width}
          height={height}
          label={label}
          contain={boxAspect !== undefined}
        />
        {overlay}
      </div>
    </figure>
  );
}
