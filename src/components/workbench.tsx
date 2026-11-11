'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  InferenceMode,
  buildHybridModelParams,
  createTriageVerdictSchema,
  evaluateBenchmarkMatrix,
  getBenchmarkCaseMatrix,
  getHeroScenarios,
  probeLanguageModelReadiness,
  type EnvironmentReadinessStatus,
  type InferenceReceipt,
  type TransitionScenario,
} from '../core/flow-witness-engine.ts';
import { readCloudConfig } from '../lib/firebase-cloud.ts';
import { createBrowserHybridRuntime } from '../lib/hybrid-runtime.ts';
import type { RunView } from '../lib/run-view.ts';
import { encodeDiffSprite, type SpriteImage } from '../lib/sprite-image.ts';
import { createStudioStore } from '../lib/studio-store.ts';
import {
  answerOriginOf,
  applyPatchAndRender,
  computePairDiff,
  countOpenContradictions,
  pairFromScenario,
  runEscalationBeat,
  runPairThroughBeats,
  runTriageBeat,
  type PairRunResult,
  type RuntimeFactory,
  type TransitionPair,
} from '../lib/verification-pipeline.ts';
import { BenchmarkDrawer, type LiveCaseView, type LiveProofState } from './benchmark-drawer.tsx';
import { ByoDropzone } from './byo-dropzone.tsx';
import { ReadinessPill } from './readiness-pill.tsx';
import { ScenarioTabs } from './scenario-tabs.tsx';
import { Storyboard } from './storyboard.tsx';
import { TelemetryHud, type CloudStatus, type SessionTotals } from './telemetry-hud.tsx';
import { Eyebrow } from './ui.tsx';

const HERO_PAIRS: readonly TransitionPair[] = getHeroScenarios().map(pairFromScenario);
const BENCHMARK_CASES: readonly TransitionScenario[] = getBenchmarkCaseMatrix();
// One persistence lie, one unsure-to-cloud escalation and one benign control.
const LIVE_PROOF_CASE_IDS: readonly string[] = ['C01', 'C06', 'C08'];
// Benchmark runs use their own id range so their receipt ids never collide
// with storyboard runs.
const LIVE_RUN_ID_BASE = 100_000;

const CLOUD_CONFIG = readCloudConfig();
const CLOUD_STATUS: CloudStatus = {
  configured: CLOUD_CONFIG !== null,
  appCheck: CLOUD_CONFIG?.recaptchaSiteKey !== undefined,
  model:
    CLOUD_CONFIG?.model ??
    buildHybridModelParams({
      mode: InferenceMode.PREFER_IN_CLOUD,
      schema: createTriageVerdictSchema(),
      systemInstruction: '',
    }).inCloudParams.model,
};

function replayReasonFor(view: Pick<RunView, 'confidentialMode' | 'cloudCutActive'> | null): string {
  if (view?.confidentialMode) {
    return 'on-device only';
  }
  if (!CLOUD_STATUS.configured) {
    return 'No Firebase Env';
  }
  if (view?.cloudCutActive) {
    return 'cloud outage simulated';
  }
  return 'model call failed';
}

function makeRuntimeFactory(
  readiness: EnvironmentReadinessStatus,
  sprite: SpriteImage | null,
): RuntimeFactory {
  return (contract) =>
    createBrowserHybridRuntime({
      availability: readiness.multimodalAvailability,
      sprite,
      contract,
      cloud: CLOUD_CONFIG,
    });
}

function sumReceipts(receipts: readonly InferenceReceipt[]): SessionTotals {
  return receipts.reduce<SessionTotals>(
    (totals, receipt) => ({
      receipts: totals.receipts + 1,
      cloudCalls: totals.cloudCalls + receipt.cloudCallsMade,
      onDeviceCalls: totals.onDeviceCalls + receipt.onDeviceCallsMade,
      fallbacks: totals.fallbacks + (receipt.fallbackTriggered ? 1 : 0),
    }),
    { receipts: 0, cloudCalls: 0, onDeviceCalls: 0, fallbacks: 0 },
  );
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'unexpected error';
}

export function Workbench() {
  const [store] = useState(createStudioStore);
  const studio = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const [readiness, setReadiness] = useState<EnvironmentReadinessStatus | null>(null);
  const [byoPair, setByoPair] = useState<TransitionPair | null>(null);
  const [patchResult, setPatchResult] = useState<ReturnType<typeof applyPatchAndRender> | null>(null);
  const [patchBusy, setPatchBusy] = useState(false);
  const [runView, setRunView] = useState<RunView | null>(null);
  const [receipts, setReceipts] = useState<readonly InferenceReceipt[]>([]);
  const [byoOpen, setByoOpen] = useState(false);
  const [benchmarkOpen, setBenchmarkOpen] = useState(false);
  const [liveResults, setLiveResults] = useState<Readonly<Record<string, LiveCaseView>>>({});
  const [liveProof, setLiveProof] = useState<LiveProofState>({
    status: 'idle',
    caseIds: LIVE_PROOF_CASE_IDS,
  });
  const [liveBusy, setLiveBusy] = useState(false);
  const liveRunId = useRef(LIVE_RUN_ID_BASE);

  useEffect(() => {
    let active = true;
    void probeLanguageModelReadiness().then((status) => {
      if (active) {
        setReadiness(status);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const benchmark = useMemo(() => evaluateBenchmarkMatrix(BENCHMARK_CASES), []);
  const selectedBenchmark = BENCHMARK_CASES.find((pair) => pair.id === studio.selectedScenarioId);
  const activePair =
    studio.selectedScenarioId === 'BYO_CUSTOM'
      ? byoPair
      : (HERO_PAIRS.find((pair) => pair.id === studio.selectedScenarioId)
          ?? (selectedBenchmark ? pairFromScenario(selectedBenchmark) : null));
  const diff = useMemo(() => (activePair ? computePairDiff(activePair) : null), [activePair]);
  const patchedDiff = patchResult?.diff ?? null;
  const totals = useMemo(() => sumReceipts(receipts), [receipts]);

  const interactive = readiness !== null;
  const running = studio.runPhase === 'running_beat1' || studio.runPhase === 'running_beat2';
  const contradictions = diff
    ? countOpenContradictions({
        triage: studio.triageVerdict,
        escalation: studio.escalationVerdict,
        activeDiff: studio.patched && patchedDiff ? patchedDiff : diff,
      })
    : 0;

  const recordReceipt = (receipt: InferenceReceipt) => {
    setReceipts((current) => [...current, receipt]);
  };

  const runStoryboard = async (pair: TransitionPair) => {
    const started = store.dispatch({ type: 'START_RUN' });
    setPatchResult(null);
    const runId = started.activeRunId;
    const { confidentialMode, cloudCutActive } = started;
    const isCurrent = () => store.getState().activeRunId === runId;
    const updateView = (patch: Partial<Omit<RunView, 'runId'>>) => {
      setRunView((current) => (current?.runId === runId ? { ...current, ...patch } : current));
    };
    setRunView({ runId, pairId: pair.id, confidentialMode, cloudCutActive });

    try {
      const diffForRun = computePairDiff(pair);
      const sprite = await encodeDiffSprite(diffForRun).catch(() => null);
      const readinessNow = await probeLanguageModelReadiness();
      setReadiness(readinessNow);
      if (!isCurrent()) {
        return;
      }

      const beatRequest = {
        runId,
        pair,
        diff: diffForRun,
        confidentialMode,
        cloudCutActive,
        createRuntime: makeRuntimeFactory(readinessNow, sprite),
      };

      const triage = await runTriageBeat({ ...beatRequest, stepId: 'beat1-triage' });
      recordReceipt(triage.receipt);
      const triageOrigin = answerOriginOf(triage, pair);
      updateView({ triage: { outcome: triage, origin: triageOrigin }, failure: triageOrigin === 'replay' && !CLOUD_CONFIG ? undefined : triage.error });
      if (!isCurrent()) {
        return;
      }
      if (triage.status === 'blocked' || triageOrigin === 'unanswered') {
        store.dispatch({ type: 'CANCEL_RUN' });
        return;
      }
      store.dispatch({ type: 'BEAT1_COMPLETE', runId, triageVerdict: triage.data });
      if (triage.data.verdict === 'benign_transition') {
        return { triage, escalation: null, blocked: false, usedReplay: triageOrigin === 'replay', finalBug: false } satisfies PairRunResult;
      }

      const escalation = await runEscalationBeat({
        ...beatRequest,
        stepId: 'beat2-escalation',
        triage: triage.data,
      });
      recordReceipt(escalation.receipt);
      const escalationOrigin = answerOriginOf(escalation, pair);
      updateView({ escalation: { outcome: escalation, origin: escalationOrigin }, failure: escalationOrigin === 'replay' && !CLOUD_CONFIG ? undefined : escalation.error });
      if (!isCurrent()) {
        return;
      }
      if (escalation.status === 'blocked' || escalationOrigin === 'unanswered') {
        store.dispatch({ type: 'CANCEL_RUN' });
        return;
      }
      store.dispatch({ type: 'BEAT2_COMPLETE', runId, escalationVerdict: escalation.data });
      return {
        triage, escalation, blocked: false,
        usedReplay: triageOrigin === 'replay' || escalationOrigin === 'replay',
        finalBug: escalation.data.verdict !== 'benign_transition',
      } satisfies PairRunResult;
    } catch (error: unknown) {
      updateView({ failure: describeError(error) });
      if (isCurrent()) {
        store.dispatch({ type: 'CANCEL_RUN' });
      }
    }
  };

  const applyPatch = async () => {
    if (!activePair || !studio.escalationVerdict || patchBusy) return;
    const runId = studio.activeRunId;
    const confidentialMode = studio.confidentialMode;
    const isCurrent = () => store.getState().activeRunId === runId
      && store.getState().confidentialMode === confidentialMode;
    setPatchBusy(true);
    try {
      const result = applyPatchAndRender(activePair, studio.escalationVerdict.cssOrStatePatch);
      const sprite = await encodeDiffSprite(result.diff);
      const status = await probeLanguageModelReadiness();
      if (!isCurrent()) return;
      const triage = await runTriageBeat({
        runId, stepId: 'patched-beat1', pair: result.pair, diff: result.diff,
        confidentialMode: studio.confidentialMode, cloudCutActive: studio.cloudCutActive,
        createRuntime: makeRuntimeFactory(status, sprite),
      });
      recordReceipt(triage.receipt);
      if (!isCurrent()) return;
      setPatchResult(result);
      if (!result.claimSatisfied) throw new Error('Patch executed, but the example still violates the expected claim.');
      if (triage.status === 'ok' && triage.data.verdict !== 'benign_transition') {
        throw new Error('Patch executed, but Beat 1 still flags a contradiction.');
      }
      if (triage.status === 'blocked') throw new Error('Patched triage was blocked; verification did not complete.');
      if (triage.status === 'ok') {
        store.dispatch({ type: 'BEAT1_COMPLETE', runId, triageVerdict: triage.data });
      }
      store.dispatch({ type: 'APPLY_PATCH' });
      setRunView((current) => current?.runId === runId ? {
        ...current,
        failure: triage.status === 'ok' ? undefined : 'Patch executed and deterministic claim passed; Beat 1 was requested but no model answered.',
      } : current);
    } catch (error: unknown) {
      setRunView((current) => current?.runId === runId ? { ...current, failure: describeError(error) } : current);
    } finally {
      setPatchBusy(false);
    }
  };

  const selectScenario = (scenarioId: string) => {
    setPatchResult(null);
    store.dispatch({ type: 'SELECT_SCENARIO', scenarioId });
    setRunView(null);
  };

  const runByo = (pair: TransitionPair) => {
    setByoPair(pair);
    store.dispatch({
      type: 'LOAD_BYO_SNAPSHOT',
      expectedClaim: pair.expectedClaim,
      sourceSlice: pair.sourceSlice,
    });
    setRunView(null);
    void runStoryboard(pair);
  };

  const runLiveCase = async (scenario: TransitionScenario): Promise<PairRunResult> => {
    const pair = pairFromScenario(scenario);
    const caseDiff = computePairDiff(pair);
    const [status, sprite] = await Promise.all([
      probeLanguageModelReadiness(),
      encodeDiffSprite(caseDiff).catch(() => null),
    ]);
    const { confidentialMode, cloudCutActive } = store.getState();
    liveRunId.current += 1;
    const result = await runPairThroughBeats({
      runId: liveRunId.current,
      stepPrefix: scenario.id,
      pair,
      diff: caseDiff,
      confidentialMode,
      cloudCutActive,
      createRuntime: makeRuntimeFactory(status, sprite),
    });
    recordReceipt(result.triage.receipt);
    if (result.escalation) {
      recordReceipt(result.escalation.receipt);
    }
    return result;
  };

  const executeAndRecordLiveCase = async (scenario: TransitionScenario) => {
    const caseId = scenario.id;
    setLiveResults((current) => ({ ...current, [caseId]: { status: 'running' } }));
    const startedAt = performance.now();
    try {
      const result = await runLiveCase(scenario);
      const elapsedMs = Math.round(performance.now() - startedAt);
      setLiveResults((current) => ({ ...current, [caseId]: { status: 'done', result, elapsedMs } }));
    } catch (error: unknown) {
      setLiveResults((current) => ({
        ...current,
        [caseId]: { status: 'error', message: describeError(error) },
      }));
    }
  };

  const verifyCaseLive = async (caseId: string) => {
    const scenario = BENCHMARK_CASES.find((entry) => entry.id === caseId);
    if (!scenario) {
      return;
    }
    selectScenario(caseId);
    setLiveBusy(true);
    setLiveResults((current) => ({ ...current, [caseId]: { status: 'running' } }));
    const startedAt = performance.now();
    try {
      const result = await runStoryboard(pairFromScenario(scenario));
      setLiveResults((current) => ({ ...current, [caseId]: result
        ? { status: 'done', result, elapsedMs: Math.round(performance.now() - startedAt) }
        : { status: 'error', message: 'No model answered or run was cancelled; see storyboard.' } }));
    } finally {
      setLiveBusy(false);
    }
  };

  const runLiveProof = async () => {
    setLiveBusy(true);
    setLiveProof({ status: 'running', caseIds: LIVE_PROOF_CASE_IDS });
    const proofStartedAt = performance.now();
    try {
      // Sequential on purpose: Gemini Nano serves one session at a time and the
      // free cloud tier is rate limited, so parallel cases would only queue or 429.
      for (const caseId of LIVE_PROOF_CASE_IDS) {
        const scenario = BENCHMARK_CASES.find((entry) => entry.id === caseId);
        if (scenario) {
          await executeAndRecordLiveCase(scenario);
        }
      }
      setLiveProof({
        status: 'done',
        caseIds: LIVE_PROOF_CASE_IDS,
        elapsedMs: Math.round(performance.now() - proofStartedAt),
      });
    } finally {
      setLiveBusy(false);
    }
  };

  const latestReceipt = receipts.at(-1) ?? null;

  return (
    <div className="relative min-h-screen">
      <div aria-hidden className="fw-backdrop" />
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#060a12]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="grid size-9 place-items-center rounded-xl border border-amber-300/50 bg-gradient-to-br from-amber-300/25 to-cyan-400/20 font-mono text-sm font-black text-amber-100 shadow-[0_0_24px_-6px_rgba(245,158,11,0.6)]"
            >
              FW
            </span>
            <div>
              <h1 className="text-base font-semibold leading-tight tracking-tight text-slate-50">FlowWitness</h1>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
                hybrid ui &amp; state verification
              </p>
            </div>
          </div>
          <ReadinessPill readiness={readiness} />
          <nav aria-label="Workbench sections" className="ml-auto flex items-center gap-1 font-mono text-[11px]">
            <a
              href="#byo-dropzone"
              onClick={() => setByoOpen(true)}
              className="rounded-md px-2.5 py-1.5 text-cyan-200/90 transition hover:bg-cyan-400/10"
            >
              BYO snapshot
            </a>
            <a
              href="#benchmark-drawer"
              onClick={() => setBenchmarkOpen(true)}
              className="rounded-md px-2.5 py-1.5 text-emerald-200/90 transition hover:bg-emerald-400/10"
            >
              Benchmark
            </a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] space-y-5 px-4 pb-20 pt-5 sm:px-6">
        <section aria-label="How FlowWitness verifies" className="grid gap-3 lg:grid-cols-[1.3fr_2fr] lg:items-end">
          <div>
            <Eyebrow className="text-amber-300/80">#BuildHybridAI · Firebase AI Logic</Eyebrow>
            <p className="mt-2 max-w-xl text-2xl font-semibold leading-tight tracking-tight text-slate-50 sm:text-[1.7rem]">
              Catch the green toast that lies, without shipping every screenshot to the cloud.
            </p>
          </div>
          <ol className="grid gap-2 sm:grid-cols-3">
            <li className="rounded-xl border border-amber-400/25 bg-amber-400/[0.05] px-3 py-2.5">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-300">Beat 0 · 0 ms</span>
              <p className="mt-1 text-xs leading-snug text-slate-300">pixelmatch strips anti-aliasing and clusters what really changed.</p>
            </li>
            <li className="rounded-xl border border-cyan-400/25 bg-cyan-400/[0.05] px-3 py-2.5">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">Beat 1 · on-device</span>
              <p className="mt-1 text-xs leading-snug text-slate-300">Gemini Nano melts benign noise locally and flags the rest.</p>
            </li>
            <li className="rounded-xl border border-violet-400/25 bg-violet-400/[0.05] px-3 py-2.5">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-300">Beat 2 · cloud</span>
              <p className="mt-1 text-xs leading-snug text-slate-300">Cloud Gemini names the line and the patch for flagged items only.</p>
            </li>
          </ol>
        </section>

        <TelemetryHud
          confidentialMode={studio.confidentialMode}
          cloudCutActive={studio.cloudCutActive}
          interactive={interactive}
          onToggleConfidential={() => store.dispatch({ type: 'TOGGLE_CONFIDENTIAL_MODE' })}
          onToggleCloudCut={() => store.dispatch({ type: 'TOGGLE_CLOUD_CUT' })}
          latestReceipt={latestReceipt}
          totals={totals}
          cloud={CLOUD_STATUS}
        />

        <ScenarioTabs
          pairs={HERO_PAIRS}
          selectedId={studio.selectedScenarioId}
          disabled={!interactive}
          onSelect={selectScenario}
        />

        {activePair && diff ? (
          <Storyboard
            pair={patchResult ? { ...activePair, patchedAfterRgba: patchResult.pair.afterRgba } : { ...activePair, patchedAfterRgba: undefined }}
            diff={diff}
            patchedDiff={patchedDiff}
            studio={studio}
            runView={runView}
            contradictions={contradictions}
            replayReason={replayReasonFor(runView)}
            benchmark={benchmark}
            canRun={interactive && !running && !patchBusy}
            onRun={() => void runStoryboard(activePair)}
            patchBusy={patchBusy}
            onApplyPatch={() => void applyPatch()}
          />
        ) : (
          <p className="rounded-2xl border border-dashed border-white/10 p-6 text-sm text-slate-400">
            Load a snapshot pair in the BYO dropzone, or pick a hero scenario above.
          </p>
        )}

        <ByoDropzone
          open={byoOpen}
          interactive={interactive}
          busy={running}
          onToggle={() => setByoOpen((open) => !open)}
          onRun={runByo}
        />

        <BenchmarkDrawer
          open={benchmarkOpen}
          interactive={interactive}
          busy={liveBusy}
          summary={benchmark}
          cases={BENCHMARK_CASES}
          liveResults={liveResults}
          liveProof={liveProof}
          onToggle={() => setBenchmarkOpen((open) => !open)}
          onVerifyCase={(caseId) => void verifyCaseLive(caseId)}
          onRunLiveProof={() => void runLiveProof()}
        />
      </main>

      <footer className="border-t border-white/5 py-6 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-slate-600">
        FlowWitness · Firebase AI Logic hybrid inference · Apache-2.0
      </footer>
    </div>
  );
}
