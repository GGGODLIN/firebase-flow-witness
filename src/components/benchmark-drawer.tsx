'use client';

import type {
  ArmMetrics,
  BenchmarkMatrixSummary,
  TransitionScenario,
} from '../core/flow-witness-engine.ts';
import type { PairRunResult } from '../lib/verification-pipeline.ts';
import { cx, Eyebrow, formatInteger, formatPercent, SourceBadge } from './ui.tsx';

export type LiveCaseView =
  | { readonly status: 'running' }
  | { readonly status: 'done'; readonly result: PairRunResult; readonly elapsedMs: number }
  | { readonly status: 'error'; readonly message: string };

export interface LiveProofState {
  readonly status: 'idle' | 'running' | 'done';
  readonly caseIds: readonly string[];
  readonly elapsedMs?: number;
}

const ARM_TONE: Record<string, string> = {
  arm1: 'border-amber-400/30 before:bg-amber-400/70',
  arm2: 'border-cyan-400/30 before:bg-cyan-400/70',
  arm3: 'border-emerald-400/40 before:bg-emerald-400',
};

function ArmCard({ arm, totalCases }: { readonly arm: ArmMetrics; readonly totalCases: number }) {
  return (
    <div
      className={cx(
        'relative overflow-hidden rounded-xl border bg-slate-950/60 p-3.5 before:absolute before:inset-x-0 before:top-0 before:h-px',
        ARM_TONE[arm.armId] ?? 'border-white/10',
      )}
    >
      <Eyebrow>{arm.armId}</Eyebrow>
      <h3 className="mt-0.5 text-sm font-semibold leading-snug text-slate-100">{arm.label}</h3>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-xs">
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-slate-500">precision</dt>
          <dd className="text-base font-semibold text-slate-100">{formatPercent(arm.precision)}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-slate-500">recall</dt>
          <dd className="text-base font-semibold text-slate-100">{formatPercent(arm.recall)}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-slate-500">noise suppressed</dt>
          <dd className="text-base font-semibold text-slate-100">{formatPercent(arm.noiseSuppressionRate)}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-slate-500">cloud calls</dt>
          <dd className="text-base font-semibold text-slate-100">
            {arm.cloudCallsUsed}/{totalCases}
            <span className="ml-1 text-[10px] font-normal text-slate-500">−{arm.cloudCallReductionPct}%</span>
          </dd>
        </div>
      </dl>
      <p className="mt-2 font-mono text-[10px] text-slate-500">
        TP {arm.truePositives} · FP {arm.falsePositives} · TN {arm.trueNegatives} · FN {arm.falseNegatives}
      </p>
    </div>
  );
}

function LiveCell({ view, groundTruthIsBug }: { readonly view: LiveCaseView | undefined; readonly groundTruthIsBug: boolean }) {
  if (!view) {
    return <span className="text-slate-600">—</span>;
  }
  if (view.status === 'running') {
    return <span className="animate-pulse text-cyan-200">running…</span>;
  }
  if (view.status === 'error') {
    return <span className="text-rose-300">{view.message}</span>;
  }
  const { result } = view;
  const lastReceipt = result.escalation?.receipt ?? result.triage.receipt;
  if (result.finalBug === null) {
    return (
      <span className="text-rose-200">
        {result.blocked ? 'blocked (confidential)' : 'unanswered'}
      </span>
    );
  }
  const correct = result.finalBug === groundTruthIsBug;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className={correct ? 'text-emerald-300' : 'text-rose-300'}>
        {result.finalBug ? 'bug' : 'benign'} {correct ? '✓' : '✗'}
      </span>
      <SourceBadge source={lastReceipt.actualInferenceSource} />
      {result.usedReplay ? (
        <span className="rounded border border-dashed border-amber-300/50 px-1 text-[9px] uppercase tracking-wider text-amber-200">
          replay
        </span>
      ) : null}
      <span className="text-slate-500">{formatInteger(view.elapsedMs)} ms</span>
    </span>
  );
}

interface BenchmarkDrawerProps {
  readonly open: boolean;
  readonly interactive: boolean;
  readonly busy: boolean;
  readonly summary: BenchmarkMatrixSummary;
  readonly cases: readonly TransitionScenario[];
  readonly liveResults: Readonly<Record<string, LiveCaseView>>;
  readonly liveProof: LiveProofState;
  readonly onToggle: () => void;
  readonly onVerifyCase: (caseId: string) => void;
  readonly onRunLiveProof: () => void;
}

export function BenchmarkDrawer({
  open,
  interactive,
  busy,
  summary,
  cases,
  liveResults,
  liveProof,
  onToggle,
  onVerifyCase,
  onRunLiveProof,
}: BenchmarkDrawerProps) {
  const proofCompleted = liveProof.status === 'done';
  return (
    <section
      id="benchmark-drawer"
      aria-labelledby="benchmark-title"
      className="overflow-hidden rounded-2xl border border-emerald-400/15 bg-slate-900/40"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5">
        <div className="min-w-0">
          <Eyebrow className="text-emerald-300/80">12-scenario ground-truth benchmark</Eyebrow>
          <h2 id="benchmark-title" className="mt-1 text-lg font-semibold tracking-tight text-slate-50">
            Three arms, {summary.bugCaseCount} true bugs, {summary.benignCaseCount} benign controls
          </h2>
          <p className="mt-0.5 max-w-2xl text-sm text-slate-400">
            Table metrics come from recorded verdicts. Live proof and Verify Live re-run cases through the real
            hybrid gateway, one at a time, so the free cloud tier is never hammered.
          </p>
        </div>
        <button
          type="button"
          data-testid="open-benchmark-drawer-btn"
          aria-expanded={open}
          aria-controls="benchmark-body"
          disabled={!interactive}
          onClick={onToggle}
          className="rounded-lg border border-emerald-300/40 bg-emerald-400/10 px-3.5 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {open ? 'Close benchmark drawer' : 'Open benchmark drawer'}
        </button>
      </div>

      <div id="benchmark-body" hidden={!open} className="space-y-4 border-t border-white/5 p-4 sm:px-5">
        <div className="grid gap-3 lg:grid-cols-3">
          <ArmCard arm={summary.arms.arm1Deterministic} totalCases={summary.totalCases} />
          <ArmCard arm={summary.arms.arm2OnDeviceAlone} totalCases={summary.totalCases} />
          <ArmCard arm={summary.arms.arm3FullHybrid} totalCases={summary.totalCases} />
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/5 bg-slate-950/50 px-3 py-2.5">
          <button
            type="button"
            data-testid="run-live-proof-btn"
            disabled={!interactive || busy}
            onClick={onRunLiveProof}
            className="rounded-lg border border-emerald-300/60 bg-emerald-400/20 px-3.5 py-2 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-400/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {liveProof.status === 'running' ? 'Running live proof…' : 'Run 3-Scenario Live Proof'}
          </button>
          <span className="font-mono text-[11px] text-slate-400">
            {liveProof.caseIds.join(' · ')} — one persistence lie, one unsure escalation, one benign control
          </span>
          {proofCompleted ? (
            <span
              data-testid="live-proof-completed-badge"
              className="fw-rise ml-auto rounded-full border border-emerald-300/60 bg-emerald-400/15 px-3 py-1 font-mono text-[11px] font-semibold text-emerald-100"
            >
              Live proof complete · {liveProof.caseIds.length}/{liveProof.caseIds.length}
              {liveProof.elapsedMs !== undefined ? ` · ${formatInteger(liveProof.elapsedMs)} ms` : ''}
            </span>
          ) : null}
        </div>

        <div className="overflow-x-auto rounded-xl border border-white/5">
          <table className="w-full min-w-[56rem] border-collapse text-left text-xs">
            <thead className="bg-slate-950/70 font-mono text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th scope="col" className="px-3 py-2">case</th>
                <th scope="col" className="px-3 py-2">truth</th>
                <th scope="col" className="px-3 py-2">arm 1 pixelmatch</th>
                <th scope="col" className="px-3 py-2">arm 2 nano verdict</th>
                <th scope="col" className="px-3 py-2">arm 3 hybrid</th>
                <th scope="col" className="px-3 py-2">live</th>
                <th scope="col" className="px-3 py-2">
                  <span className="sr-only">action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {summary.perCaseRows.map((row) => {
                const scenario = cases.find((entry) => entry.id === row.id);
                return (
                  <tr key={row.id} className="border-t border-white/5 align-top hover:bg-white/[0.02]">
                    <td className="px-3 py-2">
                      <div className="font-mono text-[11px] text-slate-400">{row.id}</div>
                      <div className="text-slate-200">{row.title}</div>
                      {scenario ? <div className="text-[11px] text-slate-500">{scenario.subtitle}</div> : null}
                    </td>
                    <td className="px-3 py-2 font-mono">
                      <span className={row.groundTruthIsBug ? 'text-rose-300' : 'text-emerald-300'}>
                        {row.groundTruthIsBug ? 'bug' : 'benign'}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-300">{row.arm1Flagged ? 'flagged' : 'clear'}</td>
                    <td className="px-3 py-2 font-mono text-slate-300">{row.arm2Verdict}</td>
                    <td className="px-3 py-2 font-mono text-slate-300">
                      {row.arm3FinalBug ? 'bug' : 'benign'}
                      <span className="ml-1 text-[10px] text-slate-500">
                        {row.escalatedToCloud ? '· escalated' : '· local'}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px]">
                      <LiveCell view={liveResults[row.id]} groundTruthIsBug={row.groundTruthIsBug} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        data-testid={`verify-live-${row.id}`}
                        disabled={!interactive || busy}
                        onClick={() => onVerifyCase(row.id)}
                        className="whitespace-nowrap rounded-md border border-white/15 px-2 py-1 font-mono text-[10px] text-slate-200 transition hover:border-emerald-300/50 hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Verify Live
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
