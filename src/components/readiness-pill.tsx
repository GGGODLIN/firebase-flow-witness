'use client';

import { useEffect, useRef, useState } from 'react';
import {
  CHROME_FLAGS_MULTIMODAL_HELPER,
  type EnvironmentReadinessStatus,
  type LanguageModelAvailabilityState,
} from '../core/flow-witness-engine.ts';
import { cx } from './ui.tsx';

type CopyState = 'idle' | 'copied' | 'manual';

const AVAILABILITY_TONE: Record<LanguageModelAvailabilityState, string> = {
  available: 'text-emerald-300',
  downloadable: 'text-amber-300',
  downloading: 'text-amber-300',
  unavailable: 'text-rose-300',
  missing_global: 'text-slate-400',
};

function headline(readiness: EnvironmentReadinessStatus | null): {
  readonly dot: string;
  readonly label: string;
} {
  if (readiness === null) {
    return { dot: 'bg-slate-500 animate-pulse', label: 'Probing Gemini Nano…' };
  }
  if (readiness.canRunOnDeviceMultimodal) {
    return { dot: 'bg-emerald-400', label: 'Gemini Nano multimodal ready' };
  }
  if (readiness.canRunOnDeviceText) {
    return { dot: 'bg-amber-400', label: 'Nano text-only · enable multimodal' };
  }
  if (readiness.textAvailability === 'missing_global') {
    return { dot: 'bg-slate-400', label: 'No window.LanguageModel · cloud fallback' };
  }
  return { dot: 'bg-amber-400', label: 'Gemini Nano not ready yet' };
}

interface ReadinessPillProps {
  readonly readiness: EnvironmentReadinessStatus | null;
}

export function ReadinessPill({ readiness }: ReadinessPillProps) {
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { dot, label } = headline(readiness);

  useEffect(
    () => () => {
      clearTimeout(resetTimer.current);
    },
    [],
  );

  const copyFlagsHelper = async () => {
    clearTimeout(resetTimer.current);
    try {
      await navigator.clipboard.writeText(CHROME_FLAGS_MULTIMODAL_HELPER);
      setCopyState('copied');
    } catch {
      // Clipboard permission can be denied (embedded or headless browsers), so
      // the address is shown as selectable text for a manual copy instead.
      setCopyState('manual');
    }
    resetTimer.current = setTimeout(() => setCopyState('idle'), 6000);
  };

  return (
    <div
      data-testid="readiness-pill"
      className="flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-slate-900/70 py-1 pl-3 pr-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
    >
      <span aria-hidden className={cx('size-2 shrink-0 rounded-full', dot)} />
      {copyState === 'manual' ? (
        <code className="truncate font-mono text-[11px] text-cyan-200 select-all">
          {CHROME_FLAGS_MULTIMODAL_HELPER}
        </code>
      ) : (
        <span className="truncate text-xs font-medium text-slate-200">{label}</span>
      )}
      <span className="hidden items-center gap-1.5 font-mono text-[10px] text-slate-500 lg:flex">
        <span>text:</span>
        <span className={readiness ? AVAILABILITY_TONE[readiness.textAvailability] : undefined}>
          {readiness?.textAvailability ?? '…'}
        </span>
        <span>multimodal:</span>
        <span className={readiness ? AVAILABILITY_TONE[readiness.multimodalAvailability] : undefined}>
          {readiness?.multimodalAvailability ?? '…'}
        </span>
      </span>
      <button
        type="button"
        data-testid="copy-chrome-flags-btn"
        onClick={() => void copyFlagsHelper()}
        title={CHROME_FLAGS_MULTIMODAL_HELPER}
        className="shrink-0 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 font-mono text-[10px] text-cyan-200 transition hover:border-cyan-300/60 hover:bg-cyan-400/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
      >
        {copyState === 'copied'
          ? 'Copied ✓'
          : copyState === 'manual'
            ? 'Select & copy'
            : 'Copy chrome://flags'}
      </button>
    </div>
  );
}
