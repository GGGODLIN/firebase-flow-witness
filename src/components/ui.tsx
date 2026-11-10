import type { ReactNode } from 'react';
import type {
  ActualInferenceSource,
  InferenceModeValue,
} from '../core/flow-witness-engine.ts';
import type { AnswerOrigin } from '../lib/verification-pipeline.ts';

export function cx(...classes: ReadonlyArray<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

interface EyebrowProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export function Eyebrow({ children, className }: EyebrowProps) {
  return (
    <span
      className={cx(
        'font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500',
        className,
      )}
    >
      {children}
    </span>
  );
}

const MODE_STYLES: Record<InferenceModeValue, string> = {
  prefer_on_device: 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200',
  only_on_device: 'border-cyan-300/60 bg-cyan-300/15 text-cyan-100',
  prefer_in_cloud: 'border-violet-400/40 bg-violet-400/10 text-violet-200',
  only_in_cloud: 'border-violet-300/60 bg-violet-300/15 text-violet-100',
};

interface ModeChipProps {
  readonly mode: InferenceModeValue;
}

export function ModeChip({ mode }: ModeChipProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider',
        MODE_STYLES[mode],
      )}
    >
      {mode}
    </span>
  );
}

const SOURCE_COPY: Record<ActualInferenceSource, { label: string; className: string }> = {
  on_device: {
    label: 'on_device · Gemini Nano',
    className: 'border-cyan-400/50 bg-cyan-400/10 text-cyan-200',
  },
  in_cloud: {
    label: 'in_cloud · Gemini',
    className: 'border-violet-400/50 bg-violet-400/10 text-violet-200',
  },
  none: {
    label: 'none · no model answered',
    className: 'border-slate-500/50 bg-slate-500/10 text-slate-300',
  },
};

interface SourceBadgeProps {
  readonly source: ActualInferenceSource;
}

export function SourceBadge({ source }: SourceBadgeProps) {
  const copy = SOURCE_COPY[source];
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-wide',
        copy.className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {copy.label}
    </span>
  );
}

interface OriginStampProps {
  readonly origin: AnswerOrigin;
  readonly replayReason: string;
}

export function OriginStamp({ origin, replayReason }: OriginStampProps) {
  if (origin === 'model') {
    return (
      <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-300/90">
        live model answer
      </span>
    );
  }
  if (origin === 'replay') {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-dashed border-amber-300/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-amber-200">
        Deterministic Replay · {replayReason}
      </span>
    );
  }
  return (
    <span className="font-mono text-[10px] uppercase tracking-widest text-rose-300">
      unanswered · {replayReason}
    </span>
  );
}

const VERDICT_STYLES: Record<string, string> = {
  benign_transition: 'border-emerald-400/50 bg-emerald-400/10 text-emerald-200',
  false_green_persistence_lie: 'border-rose-400/50 bg-rose-400/10 text-rose-200',
  layout_or_token_break: 'border-orange-400/50 bg-orange-400/10 text-orange-200',
  unsure: 'border-amber-300/60 bg-amber-300/10 text-amber-100',
};

interface VerdictChipProps {
  readonly verdict: string;
}

export function VerdictChip({ verdict }: VerdictChipProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-md border px-2 py-1 font-mono text-xs font-semibold',
        VERDICT_STYLES[verdict] ?? 'border-slate-500/50 text-slate-200',
      )}
    >
      {verdict}
    </span>
  );
}

interface MetricProps {
  readonly label: string;
  readonly value: ReactNode;
  readonly hint?: string;
  readonly tone?: 'amber' | 'cyan' | 'violet' | 'emerald' | 'rose' | 'slate';
}

const TONE_TEXT: Record<NonNullable<MetricProps['tone']>, string> = {
  amber: 'text-amber-200',
  cyan: 'text-cyan-200',
  violet: 'text-violet-200',
  emerald: 'text-emerald-200',
  rose: 'text-rose-200',
  slate: 'text-slate-100',
};

export function Metric({ label, value, hint, tone = 'slate' }: MetricProps) {
  return (
    <div className="min-w-0">
      <Eyebrow>{label}</Eyebrow>
      <div className={cx('mt-0.5 font-mono text-lg font-semibold tabular-nums', TONE_TEXT[tone])}>
        {value}
      </div>
      {hint ? <div className="mt-0.5 text-[11px] leading-snug text-slate-500">{hint}</div> : null}
    </div>
  );
}

export function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

export function formatInteger(value: number): string {
  return value.toLocaleString('en-US');
}
