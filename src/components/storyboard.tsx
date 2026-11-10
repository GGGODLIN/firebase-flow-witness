'use client';

import type { ReactNode } from 'react';
import type {
  BenchmarkMatrixSummary,
  InferenceReceipt,
  TransitionDiffResult,
} from '../core/flow-witness-engine.ts';
import type { StudioState } from '../core/studio-model.ts';
import type { EscalationRecord, RunView, TriageRecord } from '../lib/run-view.ts';
import {
  escalationModeFor,
  triageModeFor,
  type TransitionPair,
} from '../lib/verification-pipeline.ts';
import { RegionOverlay, TransitionFrame, type RegionState } from './transition-frames.tsx';
import {
  cx,
  Eyebrow,
  formatInteger,
  formatPercent,
  Metric,
  ModeChip,
  OriginStamp,
  SourceBadge,
  VerdictChip,
} from './ui.tsx';

type Tone = 'amber' | 'cyan' | 'violet' | 'rose' | 'emerald';

const BADGE_TONE: Record<Tone, string> = {
  amber: 'border-amber-400/50 bg-amber-400/10 text-amber-200',
  cyan: 'border-cyan-400/50 bg-cyan-400/10 text-cyan-200',
  violet: 'border-violet-400/50 bg-violet-400/10 text-violet-200',
  rose: 'border-rose-400/50 bg-rose-400/10 text-rose-200',
  emerald: 'border-emerald-400/50 bg-emerald-400/10 text-emerald-200',
};

const CARD_TONE: Record<Tone, string> = {
  amber: 'border-amber-400/25 before:bg-amber-400/70',
  cyan: 'border-cyan-400/25 before:bg-cyan-400/70',
  violet: 'border-violet-400/25 before:bg-violet-400/70',
  rose: 'border-rose-400/50 before:bg-rose-400',
  emerald: 'border-emerald-400/30 before:bg-emerald-400/70',
};

interface BeatShellProps {
  readonly beat: number;
  readonly tone: Tone;
  readonly title: string;
  readonly subtitle: string;
  readonly aside?: ReactNode;
  readonly children: ReactNode;
  readonly testId?: string;
  readonly role?: 'alert';
}

function BeatShell({ beat, tone, title, subtitle, aside, children, testId, role }: BeatShellProps) {
  return (
    <article
      data-testid={testId}
      role={role}
      className={cx(
        'fw-rise relative flex h-full flex-col gap-3 overflow-hidden rounded-xl border bg-slate-900/70 p-4 before:absolute before:inset-x-0 before:top-0 before:h-px',
        CARD_TONE[tone],
      )}
    >
      <header className="flex items-start gap-3">
        <span
          className={cx(
            'grid size-9 shrink-0 place-items-center rounded-lg border font-mono text-sm font-bold',
            BADGE_TONE[tone],
          )}
        >
          {beat}
        </span>
        <div className="min-w-0 flex-1">
          <Eyebrow>Beat {beat}</Eyebrow>
          <h3 className="text-sm font-semibold leading-snug text-slate-100">{title}</h3>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{subtitle}</p>
        </div>
        {aside}
      </header>
      {children}
    </article>
  );
}

function Working({ label }: { readonly label: string }) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-white/5 bg-slate-950/70 px-3 py-4">
      <div aria-hidden className="fw-scanline absolute inset-x-0 top-0 h-1/2" />
      <p className="relative font-mono text-xs text-slate-300">{label}</p>
    </div>
  );
}

function IdleNote({ children }: { readonly children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-white/10 px-3 py-3 text-xs leading-relaxed text-slate-500">
      {children}
    </p>
  );
}

function ReceiptMeta({ receipt }: { readonly receipt: InferenceReceipt }) {
  const baseUrl = receipt.singleRequestOptionsPassed?.baseUrl;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-white/5 pt-2 font-mono text-[10px] text-slate-400">
      <dt className="text-slate-600">receipt</dt>
      <dd className="truncate">{receipt.receiptId}</dd>
      <dt className="text-slate-600">latency</dt>
      <dd>{formatInteger(receipt.latencyMs)} ms</dd>
      <dt className="text-slate-600">fallback</dt>
      <dd className={receipt.fallbackReason === 'NONE' ? undefined : 'text-amber-200'}>
        {receipt.fallbackReason}
      </dd>
      <dt className="text-slate-600">calls</dt>
      <dd>
        {receipt.onDeviceCallsMade} on-device · {receipt.cloudCallsMade} cloud · schema{' '}
        {receipt.schemaValid ? 'valid' : 'invalid'}
      </dd>
      {baseUrl ? (
        <>
          <dt className="text-slate-600">baseUrl</dt>
          <dd className="truncate text-rose-200">{baseUrl}</dd>
        </>
      ) : null}
    </dl>
  );
}

const BLOCK_EXPLANATIONS: Record<string, string> = {
  CONFIDENTIAL_MODE_ADAPTER_MISSING:
    'This browser has no window.LanguageModel, so the app-level guard stopped the request before @firebase/ai could take its `if (!chromeAdapter) return inCloudCall()` path and upload the screenshot.',
  CONFIDENTIAL_MODE_MODEL_UNAVAILABLE:
    'Chrome exposes window.LanguageModel, but Gemini Nano is not downloaded or not ready yet.',
  ON_DEVICE_PROMPT_EXCEPTION:
    'Gemini Nano threw while answering, and Confidential Mode never retries in the cloud.',
  ON_DEVICE_SCHEMA_PARSE_FAILURE:
    'Gemini Nano returned JSON that failed the schema, and Confidential Mode never retries in the cloud.',
};

function ConfidentialBlockedBanner({
  beat,
  receipt,
}: {
  readonly beat: number;
  readonly receipt: InferenceReceipt;
}) {
  return (
    <BeatShell
      beat={beat}
      tone="rose"
      title="Confidential Mode blocked this beat"
      subtitle="ONLY_ON_DEVICE · zero-upload guarantee"
      testId="confidential-blocked-banner"
      role="alert"
    >
      <code className="block rounded-md border border-rose-400/40 bg-rose-500/10 px-3 py-2 font-mono text-sm font-semibold text-rose-100">
        {receipt.fallbackReason}
      </code>
      <p className="text-xs leading-relaxed text-slate-300">
        {BLOCK_EXPLANATIONS[receipt.fallbackReason] ??
          'The on-device model could not answer, and Confidential Mode never falls back to the cloud.'}
      </p>
      <ul className="grid grid-cols-2 gap-2 font-mono text-[11px]">
        <li className="rounded-md border border-white/5 bg-slate-950/60 px-2 py-1.5 text-emerald-200">
          {receipt.cloudCallsMade} cloud calls
        </li>
        <li className="rounded-md border border-white/5 bg-slate-950/60 px-2 py-1.5 text-emerald-200">
          0 bytes uploaded
        </li>
      </ul>
      <p className="text-[11px] leading-relaxed text-slate-500">
        Enable <span className="font-mono text-cyan-200">chrome://flags/#prompt-api-for-gemini-nano-multimodal-input</span>{' '}
        and relaunch Chrome, or turn off Confidential Mode to allow a cloud fallback.
      </p>
      <ReceiptMeta receipt={receipt} />
    </BeatShell>
  );
}

interface Beat0CardProps {
  readonly pair: TransitionPair;
  readonly diff: TransitionDiffResult;
  readonly patchedDiff: TransitionDiffResult | null;
  readonly patched: boolean;
}

function Beat0Card({ pair, diff, patchedDiff, patched }: Beat0CardProps) {
  const raw = Math.max(1, diff.rawDiffPixels);
  const meaningfulShare = (diff.meaningfulDiffPixels / raw) * 100;
  const aaShare = (diff.aaSuppressedPixels / raw) * 100;
  const candidateCount = pair.candidateRects?.length;
  return (
    <BeatShell
      beat={0}
      tone="amber"
      title="Deterministic pixel & DOM noise filter"
      subtitle="pixelmatch · threshold 0.1 · includeAA: false · 0 model calls"
      aside={<span className="font-mono text-[10px] text-amber-200/80">0 ms·local</span>}
    >
      <div className="grid grid-cols-3 gap-3">
        <Metric label="Raw diff px" value={formatInteger(diff.rawDiffPixels)} />
        <Metric label="AA suppressed" value={formatInteger(diff.aaSuppressedPixels)} tone="amber" />
        <Metric label="Meaningful" value={formatInteger(diff.meaningfulDiffPixels)} tone="rose" />
      </div>
      <div
        className="flex h-2 overflow-hidden rounded-full bg-white/5"
        role="img"
        aria-label={`${formatInteger(diff.meaningfulDiffPixels)} meaningful and ${formatInteger(diff.aaSuppressedPixels)} anti-aliasing pixels`}
      >
        <div className="h-full bg-rose-400/80" style={{ width: `${meaningfulShare}%` }} />
        <div className="h-full bg-amber-300/70" style={{ width: `${aaShare}%` }} />
      </div>
      <dl className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-md border border-white/5 bg-slate-950/60 px-2 py-1.5">
          <dt className="text-slate-500">Clustered regions</dt>
          <dd className="font-mono text-slate-200">
            {diff.clusteredRegions.length} / 6 cap
            <span className="text-slate-500">
              {candidateCount !== undefined ? ` · from ${candidateCount} DOM rects` : ' · 6×4 grid scan'}
            </span>
          </dd>
        </div>
        <div className="rounded-md border border-white/5 bg-slate-950/60 px-2 py-1.5">
          <dt className="text-slate-500">Composite sprite</dt>
          <dd className="font-mono text-slate-200">
            {diff.spriteWidth}×{diff.spriteHeight}
            <span className="text-slate-500"> · {diff.estimatedImageTokens} img tokens</span>
          </dd>
        </div>
      </dl>
      {pair.domDelta.length > 0 ? (
        <ul className="space-y-1.5">
          {pair.domDelta.map((entry) => (
            <li
              key={`${entry.selector}:${entry.attributeOrText}`}
              className="rounded-md border border-white/5 bg-slate-950/60 px-2 py-1.5 font-mono text-[10px] leading-relaxed"
            >
              <span className="text-cyan-200">{entry.selector}</span>{' '}
              <span className="text-slate-500">{entry.attributeOrText}</span>
              <div className="text-slate-300">
                “{entry.beforeValue}” → “{entry.afterValue}”{' '}
                <span className={entry.persistedAfterReload ? 'text-emerald-300' : 'text-rose-300'}>
                  {entry.persistedAfterReload ? 'persists on reload' : 'reverts on reload'}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-slate-500">No DOM delta: screenshot-only pair, so Beat 0 scans a 6×4 grid.</p>
      )}
      {patched && patchedDiff ? (
        <p className="rounded-md border border-emerald-400/30 bg-emerald-400/[0.06] px-2 py-1.5 font-mono text-[11px] text-emerald-200">
          Re-verify on patched frame: {formatInteger(patchedDiff.meaningfulDiffPixels)} meaningful px ·{' '}
          {patchedDiff.clusteredRegions.length} regions · Beat 1 not needed
        </p>
      ) : null}
    </BeatShell>
  );
}

interface Beat1PanelProps {
  readonly record: TriageRecord | undefined;
  readonly running: boolean;
  readonly confidentialMode: boolean;
  readonly replayReason: string;
  readonly warmupNote: string | null;
}

function Beat1Panel({ record, running, confidentialMode, replayReason, warmupNote }: Beat1PanelProps) {
  if (record?.outcome.status === 'blocked') {
    return <ConfidentialBlockedBanner beat={1} receipt={record.outcome.receipt} />;
  }
  const requestedMode = record ? record.outcome.receipt.requestedMode : triageModeFor(confidentialMode);

  return (
    <BeatShell
      beat={1}
      tone="cyan"
      title="On-device Gemini Nano triage"
      subtitle="One multimodal sprite · narrow verdict with an explicit unsure exit"
      aside={<ModeChip mode={requestedMode} />}
      testId={record ? 'beat1-card' : undefined}
    >
      {record === undefined ? (
        running ? (
          <Working label="Gemini Nano is judging the composite sprite…" />
        ) : (
          <IdleNote>
            Beat 1 asks the browser&apos;s Gemini Nano for one verdict per transition. Benign changes melt away
            here at $0 and zero uploads; only real contradictions or <span className="font-mono">unsure</span>{' '}
            escalate.
          </IdleNote>
        )
      ) : record.origin === 'unanswered' ? (
        <>
          <p className="rounded-md border border-rose-400/30 bg-rose-500/[0.06] px-3 py-2 text-xs leading-relaxed text-rose-100">
            No model answered this transition, and a custom pair has no recorded verdict to replay. Enable Gemini
            Nano or configure the Firebase env, then run it again.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <SourceBadge source={record.outcome.receipt.actualInferenceSource} />
            <OriginStamp origin={record.origin} replayReason={replayReason} />
          </div>
          <ReceiptMeta receipt={record.outcome.receipt} />
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <VerdictChip verdict={record.outcome.data.verdict} />
            <span className="font-mono text-[11px] text-slate-400">{record.outcome.data.category}</span>
          </div>
          <div>
            <div className="flex items-center justify-between font-mono text-[10px] text-slate-500">
              <span>confidence</span>
              <span className="text-slate-300">{record.outcome.data.confidence.toFixed(2)}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-cyan-400"
                style={{ width: `${Math.round(Math.min(1, Math.max(0, record.outcome.data.confidence)) * 100)}%` }}
              />
            </div>
          </div>
          <p className="text-xs leading-relaxed text-slate-300">{record.outcome.data.reason}</p>
          {record.outcome.data.flaggedRegionIds ? (
            <p className="font-mono text-[10px] text-slate-500">
              flagged: <span className="text-rose-200">{record.outcome.data.flaggedRegionIds}</span>
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <SourceBadge source={record.outcome.receipt.actualInferenceSource} />
            <OriginStamp origin={record.origin} replayReason={replayReason} />
          </div>
          <ReceiptMeta receipt={record.outcome.receipt} />
        </>
      )}
      {warmupNote ? <p className="mt-auto font-mono text-[10px] text-slate-500">{warmupNote}</p> : null}
    </BeatShell>
  );
}

interface Beat2PanelProps {
  readonly pair: TransitionPair;
  readonly record: EscalationRecord | undefined;
  readonly studio: StudioState;
  readonly running: boolean;
  readonly replayReason: string;
  readonly onApplyPatch: () => void;
}

function Beat2Panel({ pair, record, studio, running, replayReason, onApplyPatch }: Beat2PanelProps) {
  if (record?.outcome.status === 'blocked') {
    return <ConfidentialBlockedBanner beat={2} receipt={record.outcome.receipt} />;
  }
  const requestedMode = record ? record.outcome.receipt.requestedMode : escalationModeFor(studio.confidentialMode);
  const notEscalated = studio.triageVerdict?.verdict === 'benign_transition';
  const verdict = record?.origin === 'unanswered' ? null : record?.outcome.data ?? null;
  const patchable =
    verdict !== null && verdict.verdict !== 'benign_transition' && studio.escalationVerdict !== null;
  const cloudCutFallback = record?.outcome.receipt.fallbackReason === 'CLOUD_FETCH_ERROR_FALLBACK';

  return (
    <BeatShell
      beat={2}
      tone="violet"
      title="Cloud Gemini root cause & patch"
      subtitle="Escalated items only · ≤80-line pre-sliced source · same JSON schema"
      aside={<ModeChip mode={requestedMode} />}
      testId={record ? 'beat2-card' : undefined}
    >
      {record ? (
        verdict === null ? (
          <>
            <p className="rounded-md border border-rose-400/30 bg-rose-500/[0.06] px-3 py-2 text-xs leading-relaxed text-rose-100">
              No model answered the escalation, so there is no root cause to show.
            </p>
            <ReceiptMeta receipt={record.outcome.receipt} />
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <VerdictChip verdict={verdict.verdict} />
              <code className="rounded border border-violet-400/40 bg-violet-400/10 px-1.5 py-0.5 font-mono text-[11px] text-violet-100">
                {verdict.rootCauseLine}
              </code>
            </div>
            <p className="text-xs leading-relaxed text-slate-300">{verdict.explanation}</p>
            {verdict.cssOrStatePatch.trim().length > 0 ? (
              <pre className="whitespace-pre-wrap rounded-md border border-emerald-400/20 bg-slate-950 p-2.5 font-mono text-[11px] leading-relaxed text-emerald-200 [overflow-wrap:anywhere]">
                <code>
                  {verdict.cssOrStatePatch
                    .split('\n')
                    .map((line) => `+ ${line}`)
                    .join('\n')}
                </code>
              </pre>
            ) : null}
            {cloudCutFallback ? (
              <p className="rounded-md border border-amber-300/30 bg-amber-300/[0.06] px-2 py-1.5 text-[11px] leading-relaxed text-amber-100">
                Cloud call failed against the injected base URL, so the escalation was answered on-device with the
                same schema.
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <SourceBadge source={record.outcome.receipt.actualInferenceSource} />
              <OriginStamp origin={record.origin} replayReason={replayReason} />
            </div>
            {studio.patched ? (
              <p className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 font-mono text-xs text-emerald-100">
                Patched ✓ · Beat 0 re-verified the patched frame
              </p>
            ) : patchable && pair.patchedAfterRgba ? (
              <button
                type="button"
                data-testid="apply-patch-btn"
                onClick={onApplyPatch}
                className="group inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-300/50 bg-emerald-400/15 px-3 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
              >
                Apply Patch &amp; Re-Verify
                <span aria-hidden className="transition group-hover:translate-x-0.5">→</span>
              </button>
            ) : patchable ? (
              <p className="text-[11px] leading-relaxed text-slate-500">
                Apply the patch in your code, capture a new After frame and drop it in the BYO dropzone to re-verify.
              </p>
            ) : null}
            <details className="group rounded-md border border-white/5 bg-slate-950/50 px-2.5 py-1.5">
              <summary className="cursor-pointer font-mono text-[10px] text-slate-500">
                pre-sliced source sent with the escalation ({pair.sourceSlice.split('\n').length} lines)
              </summary>
              <pre className="mt-2 overflow-x-auto font-mono text-[10px] leading-relaxed text-slate-300">
                <code>{pair.sourceSlice}</code>
              </pre>
            </details>
            <ReceiptMeta receipt={record.outcome.receipt} />
          </>
        )
      ) : notEscalated ? (
        <p className="rounded-lg border border-emerald-400/30 bg-emerald-400/[0.06] px-3 py-3 text-xs leading-relaxed text-emerald-100">
          Not escalated. Beat 1 melted this transition on-device: 0 cloud calls, 0 bytes uploaded.
        </p>
      ) : running && studio.runPhase === 'running_beat2' ? (
        <Working label="Escalating with the ≤80-line source slice…" />
      ) : (
        <IdleNote>
          Only transitions Beat 1 flags (or marks <span className="font-mono">unsure</span>) reach Cloud Gemini, with
          a deterministic source slice instead of a full screenshot stream.
        </IdleNote>
      )}
    </BeatShell>
  );
}

function contradictionCaption(studio: StudioState, showPatched: boolean): string {
  if (showPatched) {
    return 'Re-verified on the patched frame';
  }
  if (studio.triageVerdict?.verdict === 'benign_transition') {
    return 'Melted on-device by Beat 1';
  }
  if (studio.escalationVerdict?.verdict === 'benign_transition') {
    return 'Cleared by the Beat 2 diagnosis';
  }
  if (studio.escalationVerdict) {
    return 'Confirmed by the Beat 2 root cause';
  }
  if (studio.triageVerdict) {
    return 'Flagged by Beat 1, escalating';
  }
  return 'Beat 0 regions awaiting triage';
}

function regionStateFor(studio: StudioState, showPatched: boolean): RegionState {
  if (showPatched) {
    return 'cleared';
  }
  if (
    studio.triageVerdict?.verdict === 'benign_transition' ||
    studio.escalationVerdict?.verdict === 'benign_transition'
  ) {
    return 'melted';
  }
  return 'open';
}

interface RationaleCellProps {
  readonly tone: Tone;
  readonly title: string;
  readonly stat: string;
  readonly body: string;
}

function RationaleCell({ tone, title, stat, body }: RationaleCellProps) {
  return (
    <div className={cx('rounded-lg border bg-slate-950/50 px-3 py-2.5', CARD_TONE[tone])}>
      <Eyebrow>{title}</Eyebrow>
      <div className="mt-1 font-mono text-sm font-semibold text-slate-100">{stat}</div>
      <p className="mt-1 text-[11px] leading-snug text-slate-400">{body}</p>
    </div>
  );
}

function HybridRationale({ summary }: { readonly summary: BenchmarkMatrixSummary }) {
  const { arm1Deterministic: arm1, arm2OnDeviceAlone: arm2, arm3FullHybrid: arm3 } = summary.arms;
  return (
    <div className="border-t border-white/5 p-4 sm:px-5">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <Eyebrow className="text-slate-400">Why one tier is not enough</Eyebrow>
        <span className="font-mono text-[10px] text-slate-600">
          {summary.totalCases}-case ground-truth benchmark · recorded verdicts
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <RationaleCell
          tone="amber"
          title="pixelmatch alone"
          stat={`${formatPercent(arm1.precision)} precision`}
          body={`Every changed pixel is a bug: ${arm1.falsePositives} of ${summary.benignCaseCount} benign controls raised.`}
        />
        <RationaleCell
          tone="violet"
          title="Cloud LLM on every screen"
          stat={`${summary.totalCases}/${summary.totalCases} uploads`}
          body="Every transition would leave the browser and pay cloud latency and image tokens."
        />
        <RationaleCell
          tone="cyan"
          title="Gemini Nano alone"
          stat={`${formatPercent(arm2.precision)} precision`}
          body={`Its unsure exits stay unresolved: ${arm2.falsePositives} benign control flagged, no root cause line.`}
        />
        <RationaleCell
          tone="emerald"
          title="FlowWitness hybrid"
          stat={`${formatPercent(arm3.precision)} P · ${formatPercent(arm3.recall)} R`}
          body={`${arm3.cloudCallsUsed} of ${summary.totalCases} transitions escalated (${arm3.cloudCallReductionPct}% fewer cloud calls).`}
        />
      </div>
    </div>
  );
}

export interface StoryboardProps {
  readonly pair: TransitionPair;
  readonly diff: TransitionDiffResult;
  readonly patchedDiff: TransitionDiffResult | null;
  readonly studio: StudioState;
  readonly runView: RunView | null;
  readonly contradictions: number;
  readonly replayReason: string;
  readonly benchmark: BenchmarkMatrixSummary;
  readonly canRun: boolean;
  readonly onRun: () => void;
  readonly onApplyPatch: () => void;
}

export function Storyboard({
  pair,
  diff,
  patchedDiff,
  studio,
  runView,
  contradictions,
  replayReason,
  benchmark,
  canRun,
  onRun,
  onApplyPatch,
}: StoryboardProps) {
  const running = studio.runPhase === 'running_beat1' || studio.runPhase === 'running_beat2';
  const showPatched = studio.patched && pair.patchedAfterRgba !== undefined;
  const visibleDiff = showPatched && patchedDiff ? patchedDiff : diff;
  const regionState = regionStateFor(studio, showPatched);
  const view = runView?.pairId === pair.id ? runView : null;
  const warmup = view?.warmup;
  const warmupNote = warmup
    ? `initializeDeviceModel · ${warmup.initialized ? 'session warmed' : warmup.timedOut ? 'timed out at 1.5 s (non-blocking)' : 'skipped: no ready model'}`
    : null;

  return (
    <section
      aria-labelledby="storyboard-title"
      className="overflow-hidden rounded-2xl border border-white/[0.07] bg-slate-900/40 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)]"
    >
      <div className="grid items-start gap-4 border-b border-white/5 p-4 sm:p-5 lg:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <Eyebrow className="text-amber-300/80">3-Beat Verification Storyboard · {pair.id}</Eyebrow>
          <h2 id="storyboard-title" className="mt-1 text-xl font-semibold tracking-tight text-slate-50">
            {pair.title}
          </h2>
          <p className="mt-0.5 text-sm text-slate-400">{pair.subtitle}</p>
          <blockquote className="mt-3 rounded-lg border border-white/5 border-l-amber-400/70 bg-slate-950/50 px-3 py-2">
            <Eyebrow>Expected / optimistic claim</Eyebrow>
            <p className="mt-0.5 text-sm text-slate-200">“{pair.expectedClaim}”</p>
          </blockquote>
        </div>
        <div className="flex flex-wrap items-stretch gap-3 lg:flex-nowrap">
          <div
            data-testid="contradiction-count"
            data-count={String(contradictions)}
            aria-live="polite"
            className={cx(
              'min-w-[10rem] rounded-xl border px-4 py-3 transition-colors duration-500',
              contradictions > 0
                ? 'border-rose-400/40 bg-rose-500/[0.07]'
                : 'border-emerald-400/40 bg-emerald-500/[0.07]',
            )}
          >
            <Eyebrow>Open contradictions</Eyebrow>
            <div
              key={contradictions}
              className={cx(
                'fw-rise font-mono text-4xl font-bold tabular-nums',
                contradictions > 0 ? 'text-rose-200' : 'text-emerald-200',
              )}
            >
              {contradictions}
            </div>
            <p className="text-[11px] text-slate-400">{contradictionCaption(studio, showPatched)}</p>
          </div>
          <button
            type="button"
            data-testid="run-verification-btn"
            onClick={onRun}
            disabled={!canRun}
            className="flex min-w-[12rem] flex-col items-start justify-between gap-2 rounded-xl border border-amber-300/60 bg-gradient-to-br from-amber-300 to-amber-500 px-4 py-3 text-left text-slate-950 shadow-[0_12px_30px_-12px_rgba(245,158,11,0.7)] transition hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-900/70">
              {running ? 'verifying…' : 'beat 0 → 1 → 2'}
            </span>
            <span className="text-base font-bold leading-tight">Run Hybrid Verification</span>
          </button>
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-4">
        <TransitionFrame
          title="Before"
          accent="slate"
          rgba={pair.beforeRgba}
          width={pair.width}
          height={pair.height}
          label={`Before frame of ${pair.title}`}
          meta={`${pair.width}×${pair.height}`}
        />
        <TransitionFrame
          title={showPatched ? 'After · patched' : 'After'}
          accent={showPatched ? 'emerald' : regionState === 'open' ? 'rose' : 'emerald'}
          rgba={showPatched && pair.patchedAfterRgba ? pair.patchedAfterRgba : pair.afterRgba}
          width={pair.width}
          height={pair.height}
          label={`After frame of ${pair.title}`}
          meta={showPatched ? 'patch applied' : `${diff.clusteredRegions.length} regions`}
          overlay={
            <RegionOverlay
              regions={diff.clusteredRegions}
              frameWidth={pair.width}
              frameHeight={pair.height}
              state={regionState}
            />
          }
        />
        <TransitionFrame
          title="Beat 0 diff mask"
          accent="amber"
          rgba={visibleDiff.diffMaskRgba}
          width={pair.width}
          height={pair.height}
          label="Meaningful diff pixels after anti-aliasing suppression"
          meta={`${formatInteger(visibleDiff.meaningfulDiffPixels)} px`}
          checkerboard
          overlay={
            <RegionOverlay
              regions={diff.clusteredRegions}
              frameWidth={pair.width}
              frameHeight={pair.height}
              state={regionState}
            />
          }
        />
        <TransitionFrame
          title="Composite sprite → model"
          accent="cyan"
          rgba={diff.spriteRgba}
          width={diff.spriteWidth}
          height={diff.spriteHeight}
          label="Composite before and after sprite sheet sent to the models"
          meta={diff.clusteredRegions.length > 0 ? `${diff.spriteWidth}×${diff.spriteHeight} · 1 tile` : 'nothing to send'}
          checkerboard
          boxAspect={`${pair.width} / ${pair.height}`}
        />
      </div>

      <ol className="grid gap-3 px-4 pb-4 sm:px-5 sm:pb-5 lg:grid-cols-3">
        <li>
          <Beat0Card pair={pair} diff={diff} patchedDiff={patchedDiff} patched={showPatched} />
        </li>
        <li>
          <Beat1Panel
            record={view?.triage}
            running={running}
            confidentialMode={studio.confidentialMode}
            replayReason={replayReason}
            warmupNote={warmupNote}
          />
        </li>
        <li>
          <Beat2Panel
            pair={pair}
            record={view?.escalation}
            studio={studio}
            running={running}
            replayReason={replayReason}
            onApplyPatch={onApplyPatch}
          />
        </li>
      </ol>

      {view?.failure ? (
        <p role="alert" className="mx-4 mb-4 rounded-md border border-rose-400/40 bg-rose-500/10 px-3 py-2 font-mono text-xs text-rose-100 sm:mx-5">
          Run stopped: {view.failure}
        </p>
      ) : null}

      <HybridRationale summary={benchmark} />
    </section>
  );
}
