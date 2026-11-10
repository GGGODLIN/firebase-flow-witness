'use client';

import {
  FAULT_INJECTION_BASE_URL,
  type InferenceReceipt,
} from '../core/flow-witness-engine.ts';
import { escalationModeFor, triageModeFor } from '../lib/verification-pipeline.ts';
import { cx, Eyebrow, formatInteger, ModeChip, SourceBadge } from './ui.tsx';

export interface SessionTotals {
  readonly receipts: number;
  readonly cloudCalls: number;
  readonly onDeviceCalls: number;
  readonly fallbacks: number;
}

export interface CloudStatus {
  readonly configured: boolean;
  readonly appCheck: boolean;
  readonly model: string;
}

interface ToggleProps {
  readonly testId: string;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onToggle: () => void;
  readonly title: string;
  readonly detail: string;
  readonly tone: 'cyan' | 'rose';
}

function Toggle({ testId, checked, disabled, onToggle, title, detail, tone }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-testid={testId}
      disabled={disabled}
      onClick={onToggle}
      className={cx(
        'flex min-w-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        checked
          ? tone === 'cyan'
            ? 'border-cyan-300/60 bg-cyan-400/10 focus-visible:outline-cyan-300'
            : 'border-rose-300/60 bg-rose-400/10 focus-visible:outline-rose-300'
          : 'border-white/10 bg-slate-900/60 hover:border-white/20 focus-visible:outline-slate-300',
      )}
    >
      <span
        aria-hidden
        className={cx(
          'relative h-5 w-9 shrink-0 rounded-full border transition',
          checked
            ? tone === 'cyan'
              ? 'border-cyan-300/70 bg-cyan-400/40'
              : 'border-rose-300/70 bg-rose-400/40'
            : 'border-white/15 bg-slate-800',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 size-3.5 rounded-full bg-slate-100 shadow transition-all',
            checked ? 'left-[1.15rem]' : 'left-0.5',
          )}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-slate-100">{title}</span>
        <span className="block truncate font-mono text-[10px] text-slate-500">{detail}</span>
      </span>
    </button>
  );
}

interface TelemetryHudProps {
  readonly confidentialMode: boolean;
  readonly cloudCutActive: boolean;
  readonly interactive: boolean;
  readonly onToggleConfidential: () => void;
  readonly onToggleCloudCut: () => void;
  readonly latestReceipt: InferenceReceipt | null;
  readonly totals: SessionTotals;
  readonly cloud: CloudStatus;
}

export function TelemetryHud({
  confidentialMode,
  cloudCutActive,
  interactive,
  onToggleConfidential,
  onToggleCloudCut,
  latestReceipt,
  totals,
  cloud,
}: TelemetryHudProps) {
  return (
    <section
      aria-label="Hybrid telemetry"
      className="grid gap-3 rounded-2xl border border-white/[0.07] bg-slate-900/50 p-3 backdrop-blur lg:grid-cols-[1fr_1.15fr_0.95fr_1.45fr]"
    >
      <div className="rounded-xl border border-white/5 bg-slate-950/50 px-3 py-2.5">
        <Eyebrow>Routing plan</Eyebrow>
        <dl className="mt-1.5 space-y-1.5 text-[11px]">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-slate-400">Beat 1 triage</dt>
            <dd>
              <ModeChip mode={triageModeFor(confidentialMode)} />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-slate-400">Beat 2 escalation</dt>
            <dd>
              <ModeChip mode={escalationModeFor(confidentialMode)} />
            </dd>
          </div>
        </dl>
      </div>

      <div className="rounded-xl border border-white/5 bg-slate-950/50 px-3 py-2.5" aria-live="polite">
        <Eyebrow>Last inference</Eyebrow>
        {latestReceipt ? (
          <div className="mt-1.5 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <ModeChip mode={latestReceipt.requestedMode} />
              <span aria-hidden className="text-slate-600">→</span>
              <SourceBadge source={latestReceipt.actualInferenceSource} />
            </div>
            <p className="font-mono text-[10px] text-slate-400">
              {latestReceipt.stepId} · {formatInteger(latestReceipt.latencyMs)} ms ·{' '}
              <span className={latestReceipt.fallbackReason === 'NONE' ? undefined : 'text-amber-200'}>
                {latestReceipt.fallbackReason}
              </span>
            </p>
          </div>
        ) : (
          <p className="mt-1.5 text-[11px] text-slate-500">No inference yet. Every call will leave a receipt here.</p>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2 rounded-xl border border-white/5 bg-slate-950/50 px-3 py-2.5">
        <div className="col-span-4">
          <Eyebrow>Session receipts</Eyebrow>
        </div>
        <SessionStat label="calls" value={totals.receipts} tone="text-slate-100" />
        <SessionStat label="on-device" value={totals.onDeviceCalls} tone="text-cyan-200" />
        <SessionStat label="cloud" value={totals.cloudCalls} tone="text-violet-200" />
        <SessionStat label="fallbacks" value={totals.fallbacks} tone="text-amber-200" />
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
        <Toggle
          testId="toggle-confidential-mode"
          checked={confidentialMode}
          disabled={!interactive}
          onToggle={onToggleConfidential}
          title="Confidential Mode"
          detail="ONLY_ON_DEVICE · 0 cloud bytes"
          tone="cyan"
        />
        <Toggle
          testId="toggle-cloud-cut"
          checked={cloudCutActive}
          disabled={!interactive}
          onToggle={onToggleCloudCut}
          title="Simulate Cloud Outage"
          detail={`FETCH_ERROR · baseUrl ${FAULT_INJECTION_BASE_URL}`}
          tone="rose"
        />
        <p
          data-testid="cloud-config-status"
          data-configured={String(cloud.configured)}
          className={cx(
            'rounded-lg border px-2.5 py-1.5 font-mono text-[10px] leading-relaxed sm:col-span-2 lg:col-span-1',
            cloud.configured
              ? 'border-violet-400/30 bg-violet-400/[0.06] text-violet-100'
              : 'border-dashed border-amber-300/40 bg-amber-300/[0.05] text-amber-100',
          )}
        >
          {cloud.configured
            ? `Firebase AI Logic · ${cloud.model} · App Check ${cloud.appCheck ? 'on' : 'off'}`
            : 'Cloud tier: no Firebase env → Deterministic Replay (No Firebase Env)'}
        </p>
      </div>
    </section>
  );
}

function SessionStat({
  label,
  value,
  tone,
}: {
  readonly label: string;
  readonly value: number;
  readonly tone: string;
}) {
  return (
    <div className="min-w-0">
      <div className={cx('font-mono text-lg font-semibold tabular-nums', tone)}>{formatInteger(value)}</div>
      <div className="font-mono text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
    </div>
  );
}
