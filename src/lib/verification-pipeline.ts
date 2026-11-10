import {
  InferenceMode,
  computeTransitionDiff,
  createEscalationVerdictSchema,
  createTriageVerdictSchema,
  executeHybridInference,
  type BoundingBox,
  type DomDeltaEntry,
  type HybridInferenceOutcome,
  type HybridRuntimeAdapter,
  type InferenceModeValue,
  type TransitionDiffResult,
  type TransitionScenario,
} from '../core/flow-witness-engine.ts';
import type {
  EscalationVerdictPayload,
  TriageVerdictPayload,
} from '../core/studio-model.ts';

export interface RecordedVerdicts {
  readonly triage: TriageVerdictPayload;
  readonly escalation: EscalationVerdictPayload;
}

export interface TransitionPair {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly expectedClaim: string;
  readonly width: number;
  readonly height: number;
  readonly beforeRgba: Uint8ClampedArray;
  readonly afterRgba: Uint8ClampedArray;
  readonly patchedAfterRgba?: Uint8ClampedArray;
  readonly candidateRects?: readonly BoundingBox[];
  readonly domDelta: readonly DomDeltaEntry[];
  readonly sourceSlice: string;
  // Shown only when no live model answered, and always labelled as replay.
  readonly recorded?: RecordedVerdicts;
}

export function pairFromScenario(scenario: TransitionScenario): TransitionPair {
  return {
    id: scenario.id,
    title: scenario.title,
    subtitle: scenario.subtitle,
    expectedClaim: scenario.expectedClaim,
    width: scenario.width,
    height: scenario.height,
    beforeRgba: scenario.beforeRgba,
    afterRgba: scenario.afterRgba,
    patchedAfterRgba: scenario.patchedAfterRgba,
    candidateRects: scenario.candidateRects,
    domDelta: scenario.domDelta,
    sourceSlice: scenario.deterministicSourceSlice,
    recorded: {
      triage: scenario.defaultTriageVerdict,
      escalation: scenario.defaultEscalationVerdict,
    },
  };
}

export function computePairDiff(pair: TransitionPair): TransitionDiffResult {
  return computeTransitionDiff({
    width: pair.width,
    height: pair.height,
    beforeRgba: pair.beforeRgba,
    afterRgba: pair.afterRgba,
    candidateRects: pair.candidateRects,
  });
}

export function computePatchedDiff(
  pair: TransitionPair,
): TransitionDiffResult | null {
  if (!pair.patchedAfterRgba) {
    return null;
  }
  return computeTransitionDiff({
    width: pair.width,
    height: pair.height,
    beforeRgba: pair.beforeRgba,
    afterRgba: pair.patchedAfterRgba,
    candidateRects: pair.candidateRects,
  });
}

export const TRIAGE_SYSTEM_INSTRUCTION = [
  'You are FlowWitness Triage, a narrow judge for one UI state transition.',
  'You receive the expected claim, a deterministic pixel/DOM diff summary and a composite sprite image: left half is the before frame, right half the after frame, one row per numbered changed region.',
  'Pick exactly one verdict:',
  '- benign_transition: timestamps, intentional copy, loading shimmer or anti-aliasing; the claim still holds.',
  '- false_green_persistence_lie: the UI signals success but the state did not persist or reverted.',
  '- layout_or_token_break: a layout, spacing, color or design-token regression breaks the claim.',
  '- unsure: the evidence is not enough to decide.',
  'Prefer unsure over guessing. Answer with JSON only.',
].join('\n');

export const ESCALATION_SYSTEM_INSTRUCTION = [
  'You are FlowWitness Root-Cause, the deep diagnostician that only sees transitions the triage judge flagged.',
  'Use the expected claim, the triage finding, the DOM/state delta, the pre-sliced component source (at most 80 lines) and the sprite image.',
  'Name the single source line that causes the contradiction as file:line, explain it in at most two sentences, and propose the smallest CSS or state patch.',
  'If the transition is actually benign, answer benign_transition with an empty patch.',
  'Answer with JSON only.',
].join('\n');

function describeRegions(regions: readonly BoundingBox[]): string[] {
  if (regions.length === 0) {
    return ['(none)'];
  }
  return regions.map(
    (region, index) =>
      `${index + 1}. ${region.id} "${region.label ?? region.id}" at x=${region.x}, y=${region.y}, w=${region.width}, h=${region.height} (${region.changedPixels ?? 0} px)`,
  );
}

function describeDomDelta(delta: readonly DomDeltaEntry[]): string[] {
  if (delta.length === 0) {
    return ['(none provided)'];
  }
  return delta.map(
    (entry) =>
      `- ${entry.selector} ${entry.attributeOrText}: "${entry.beforeValue}" -> "${entry.afterValue}" (persisted after reload: ${entry.persistedAfterReload ? 'yes' : 'no'})`,
  );
}

// Keep this prompt free of the escalation vocabulary: on-device models (and the
// E2E LanguageModel stub) tell the two beats apart by their prompt text.
export function buildTriagePrompt(
  pair: TransitionPair,
  diff: TransitionDiffResult,
): string {
  return [
    `Transition: ${pair.title}`,
    `Expected claim: "${pair.expectedClaim}"`,
    `Deterministic diff: ${diff.rawDiffPixels} raw diff px, ${diff.aaSuppressedPixels} anti-aliasing px suppressed, ${diff.meaningfulDiffPixels} meaningful px in ${diff.clusteredRegions.length} clustered regions.`,
    'Changed regions (sprite rows, top to bottom):',
    ...describeRegions(diff.clusteredRegions),
    'DOM / state delta:',
    ...describeDomDelta(pair.domDelta),
    'Return JSON with: verdict, category (short snake_case label), confidence (0 to 1), reason (one sentence), flaggedRegionIds (comma-separated region ids, optional).',
  ].join('\n');
}

export function buildEscalationPrompt(
  pair: TransitionPair,
  diff: TransitionDiffResult,
  triage: TriageVerdictPayload,
): string {
  return [
    `Beat 2 escalation for transition: ${pair.title}`,
    `Expected claim: "${pair.expectedClaim}"`,
    `Triage verdict: ${triage.verdict} (confidence ${triage.confidence}) - ${triage.reason}`,
    `Flagged regions: ${triage.flaggedRegionIds ?? 'not specified'}`,
    'Changed regions:',
    ...describeRegions(diff.clusteredRegions),
    'DOM / state delta:',
    ...describeDomDelta(pair.domDelta),
    'Pre-sliced source:',
    '```',
    pair.sourceSlice.length > 0 ? pair.sourceSlice : '(no source provided)',
    '```',
    'Return JSON with: verdict (false_green_persistence_lie | layout_or_token_break | benign_transition), rootCauseLine (file:line), explanation, cssOrStatePatch, patchedClaimResolved (boolean).',
  ].join('\n');
}

const TRIAGE_VERDICTS: readonly string[] = [
  'benign_transition',
  'false_green_persistence_lie',
  'layout_or_token_break',
  'unsure',
];

const ESCALATION_VERDICTS: readonly string[] = [
  'false_green_persistence_lie',
  'layout_or_token_break',
  'benign_transition',
];

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw);
}

export function isTriageVerdict(raw: unknown): raw is TriageVerdictPayload {
  return (
    isRecord(raw) &&
    typeof raw.verdict === 'string' &&
    TRIAGE_VERDICTS.includes(raw.verdict) &&
    typeof raw.category === 'string' &&
    typeof raw.confidence === 'number' &&
    Number.isFinite(raw.confidence) &&
    typeof raw.reason === 'string' &&
    (raw.flaggedRegionIds === undefined ||
      typeof raw.flaggedRegionIds === 'string')
  );
}

export function isEscalationVerdict(
  raw: unknown,
): raw is EscalationVerdictPayload {
  return (
    isRecord(raw) &&
    typeof raw.verdict === 'string' &&
    ESCALATION_VERDICTS.includes(raw.verdict) &&
    typeof raw.rootCauseLine === 'string' &&
    typeof raw.explanation === 'string' &&
    typeof raw.cssOrStatePatch === 'string' &&
    typeof raw.patchedClaimResolved === 'boolean'
  );
}

// executeHybridInference() requires a fallbackValue. Pairs without recorded
// verdicts (custom BYO uploads) use these placeholders, which the UI never
// presents as a verdict: an unanswered beat ends the run instead.
const UNANSWERED_TRIAGE: TriageVerdictPayload = {
  verdict: 'unsure',
  category: 'unanswered',
  confidence: 0,
  reason: 'No on-device or cloud model answered.',
};

const UNANSWERED_ESCALATION: EscalationVerdictPayload = {
  verdict: 'layout_or_token_break',
  rootCauseLine: 'unanswered',
  explanation: 'No on-device or cloud model answered.',
  cssOrStatePatch: '',
  patchedClaimResolved: false,
};

export const NO_MEANINGFUL_CHANGE_VERDICT: TriageVerdictPayload = {
  verdict: 'benign_transition',
  category: 'no_meaningful_diff',
  confidence: 1,
  reason:
    'Beat 0 found 0 meaningful diff pixels after anti-aliasing suppression, so there is nothing to triage.',
};

export interface RuntimeContract {
  readonly mode: InferenceModeValue;
  readonly schema: unknown;
  readonly systemInstruction: string;
}

export type RuntimeFactory = (
  contract: RuntimeContract,
) => HybridRuntimeAdapter | undefined;

export interface BeatRequest {
  readonly runId: number;
  readonly stepId: string;
  readonly pair: TransitionPair;
  readonly diff: TransitionDiffResult;
  readonly confidentialMode: boolean;
  readonly cloudCutActive: boolean;
  readonly createRuntime: RuntimeFactory;
}

export function triageModeFor(confidentialMode: boolean): InferenceModeValue {
  return confidentialMode
    ? InferenceMode.ONLY_ON_DEVICE
    : InferenceMode.PREFER_ON_DEVICE;
}

// Confidential Mode promises zero cloud bytes, so escalation stays on-device too.
export function escalationModeFor(
  confidentialMode: boolean,
): InferenceModeValue {
  return confidentialMode
    ? InferenceMode.ONLY_ON_DEVICE
    : InferenceMode.PREFER_IN_CLOUD;
}

export function runTriageBeat(
  request: BeatRequest,
): Promise<HybridInferenceOutcome<TriageVerdictPayload>> {
  const mode = triageModeFor(request.confidentialMode);
  const schema = createTriageVerdictSchema();
  return executeHybridInference<TriageVerdictPayload>(
    {
      runId: request.runId,
      stepId: request.stepId,
      mode,
      promptText: buildTriagePrompt(request.pair, request.diff),
      schema,
      systemInstruction: TRIAGE_SYSTEM_INSTRUCTION,
      cloudCutActive: request.cloudCutActive,
      fallbackValue: request.pair.recorded?.triage ?? UNANSWERED_TRIAGE,
      validatePayload: isTriageVerdict,
    },
    request.createRuntime({
      mode,
      schema,
      systemInstruction: TRIAGE_SYSTEM_INSTRUCTION,
    }),
  );
}

export interface EscalationRequest extends BeatRequest {
  readonly triage: TriageVerdictPayload;
}

export function runEscalationBeat(
  request: EscalationRequest,
): Promise<HybridInferenceOutcome<EscalationVerdictPayload>> {
  const mode = escalationModeFor(request.confidentialMode);
  const schema = createEscalationVerdictSchema();
  return executeHybridInference<EscalationVerdictPayload>(
    {
      runId: request.runId,
      stepId: request.stepId,
      mode,
      promptText: buildEscalationPrompt(
        request.pair,
        request.diff,
        request.triage,
      ),
      schema,
      systemInstruction: ESCALATION_SYSTEM_INSTRUCTION,
      cloudCutActive: request.cloudCutActive,
      fallbackValue:
        request.pair.recorded?.escalation ?? UNANSWERED_ESCALATION,
      validatePayload: isEscalationVerdict,
    },
    request.createRuntime({
      mode,
      schema,
      systemInstruction: ESCALATION_SYSTEM_INSTRUCTION,
    }),
  );
}

export type AnswerOrigin = 'model' | 'replay' | 'unanswered';

export function answerOriginOf(
  outcome: HybridInferenceOutcome<unknown>,
  pair: TransitionPair,
): AnswerOrigin {
  if (outcome.status === 'ok') {
    return 'model';
  }
  return pair.recorded ? 'replay' : 'unanswered';
}

export interface PairRunResult {
  readonly triage: HybridInferenceOutcome<TriageVerdictPayload>;
  readonly escalation: HybridInferenceOutcome<EscalationVerdictPayload> | null;
  readonly blocked: boolean;
  readonly usedReplay: boolean;
  // null when the pair could not be judged (blocked or unanswered).
  readonly finalBug: boolean | null;
}

export async function runPairThroughBeats(
  request: Omit<BeatRequest, 'stepId'> & { readonly stepPrefix: string },
): Promise<PairRunResult> {
  const triage = await runTriageBeat({
    ...request,
    stepId: `${request.stepPrefix}-beat1-triage`,
  });
  const triageOrigin = answerOriginOf(triage, request.pair);
  if (triage.status === 'blocked' || triageOrigin === 'unanswered') {
    return {
      triage,
      escalation: null,
      blocked: triage.status === 'blocked',
      usedReplay: false,
      finalBug: null,
    };
  }
  if (triage.data.verdict === 'benign_transition') {
    return {
      triage,
      escalation: null,
      blocked: false,
      usedReplay: triageOrigin === 'replay',
      finalBug: false,
    };
  }

  const escalation = await runEscalationBeat({
    ...request,
    stepId: `${request.stepPrefix}-beat2-escalation`,
    triage: triage.data,
  });
  const escalationOrigin = answerOriginOf(escalation, request.pair);
  if (escalation.status === 'blocked' || escalationOrigin === 'unanswered') {
    return {
      triage,
      escalation,
      blocked: escalation.status === 'blocked',
      usedReplay: triageOrigin === 'replay',
      finalBug: null,
    };
  }
  return {
    triage,
    escalation,
    blocked: false,
    usedReplay: triageOrigin === 'replay' || escalationOrigin === 'replay',
    finalBug: escalation.data.verdict !== 'benign_transition',
  };
}

export interface ContradictionInput {
  readonly triage: TriageVerdictPayload | null;
  readonly escalation: EscalationVerdictPayload | null;
  // Beat 0 result for the frame currently on screen (patched frame after a patch).
  readonly activeDiff: TransitionDiffResult;
}

export function countOpenContradictions(input: ContradictionInput): number {
  if (input.triage?.verdict === 'benign_transition') {
    return 0;
  }
  if (input.escalation?.verdict === 'benign_transition') {
    return 0;
  }
  return input.activeDiff.clusteredRegions.length;
}
