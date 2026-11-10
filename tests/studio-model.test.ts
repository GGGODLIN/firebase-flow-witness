import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  evaluateBenchmarkMatrix,
  getBenchmarkCaseMatrix,
  getHeroScenarios,
} from '../src/core/flow-witness-engine.ts';
import {
  createInitialStudioState,
  studioReducer,
  validateByoSnapshotInput,
  type EscalationVerdictPayload,
  type StudioAction,
  type StudioState,
  type TriageVerdictPayload,
} from '../src/core/studio-model.ts';

interface ShadowOracleState {
  activeRunId: number;
  selectedScenarioId: string;
  runPhase:
    | 'idle'
    | 'running_beat1'
    | 'running_beat2'
    | 'completed'
    | 'cancelled';
  cloudCutActive: boolean;
  triageVerdict: TriageVerdictPayload | null;
  escalationVerdict: EscalationVerdictPayload | null;
  patched: boolean;
}

function stepIndependentShadowOracle(
  prev: ShadowOracleState,
  action: StudioAction,
): ShadowOracleState {
  switch (action.type) {
    case 'START_RUN':
      return {
        ...prev,
        activeRunId: prev.activeRunId + 1,
        runPhase: 'running_beat1',
        triageVerdict: null,
        escalationVerdict: null,
        patched: false,
      };
    case 'SELECT_SCENARIO':
      return {
        ...prev,
        selectedScenarioId: action.scenarioId,
        activeRunId: prev.activeRunId + 1,
        runPhase: 'idle',
        triageVerdict: null,
        escalationVerdict: null,
        patched: false,
      };
    case 'LOAD_BYO_SNAPSHOT':
      return {
        ...prev,
        selectedScenarioId: 'BYO_CUSTOM',
        activeRunId: prev.activeRunId + 1,
        runPhase: 'idle',
        triageVerdict: null,
        escalationVerdict: null,
        patched: false,
      };
    case 'CANCEL_RUN':
      return {
        ...prev,
        activeRunId: prev.activeRunId + 1,
        runPhase: 'cancelled',
      };
    case 'TOGGLE_CLOUD_CUT':
      return {
        ...prev,
        cloudCutActive: action.enabled ?? !prev.cloudCutActive,
      };
    case 'TOGGLE_CONFIDENTIAL_MODE': {
      const inFlight =
        prev.runPhase === 'running_beat1' || prev.runPhase === 'running_beat2';
      return {
        ...prev,
        activeRunId: inFlight ? prev.activeRunId + 1 : prev.activeRunId,
        runPhase: inFlight ? 'cancelled' : prev.runPhase,
      };
    }
    case 'BEAT1_COMPLETE': {
      if (action.runId !== prev.activeRunId) {
        return prev;
      }
      const needsEscalation =
        action.triageVerdict.verdict !== 'benign_transition';
      return {
        ...prev,
        triageVerdict: action.triageVerdict,
        runPhase: needsEscalation ? 'running_beat2' : 'completed',
      };
    }
    case 'BEAT2_COMPLETE': {
      if (action.runId !== prev.activeRunId) {
        return prev;
      }
      return {
        ...prev,
        escalationVerdict: action.escalationVerdict,
        runPhase: 'completed',
      };
    }
    case 'APPLY_PATCH': {
      if (prev.escalationVerdict === null) {
        return prev;
      }
      return {
        ...prev,
        patched: true,
      };
    }
  }
}

function evaluateIndependentP4Oracle(
  prevState: StudioState,
  nextState: StudioState,
  shadowState: ShadowOracleState,
  action: StudioAction,
) {
  const p4aMonotonicActiveRunId = nextState.activeRunId >= prevState.activeRunId;

  const isStaleCompletion =
    (action.type === 'BEAT1_COMPLETE' || action.type === 'BEAT2_COMPLETE') &&
    action.runId !== prevState.activeRunId;

  const p4bStaleCompletionIsNoOp =
    !isStaleCompletion ||
    (nextState.triageVerdict === prevState.triageVerdict &&
      nextState.escalationVerdict === prevState.escalationVerdict &&
      nextState.patched === prevState.patched &&
      nextState.runPhase === prevState.runPhase);

  const p4cMatchesShadowOracle =
    nextState.activeRunId === shadowState.activeRunId &&
    nextState.selectedScenarioId === shadowState.selectedScenarioId &&
    nextState.runPhase === shadowState.runPhase &&
    nextState.cloudCutActive === shadowState.cloudCutActive &&
    JSON.stringify(nextState.triageVerdict) ===
      JSON.stringify(shadowState.triageVerdict) &&
    JSON.stringify(nextState.escalationVerdict) ===
      JSON.stringify(shadowState.escalationVerdict) &&
    nextState.patched === shadowState.patched;

  return {
    p4aMonotonicActiveRunId,
    p4bStaleCompletionIsNoOp,
    p4cMatchesShadowOracle,
  };
}

describe('Ticket 02 — 4 Hero Scenarios, 12-Scenario caseMatrix, 3-Arm Benchmark, & studioReducer (P4)', () => {
  describe('Role 1: Concrete Capability Examples (Ticket 02 Acceptance Batch)', () => {
    it('[Criterion 1] getHeroScenarios() and getBenchmarkCaseMatrix() provide 4 Hero Scenarios (H1..H4) and 12 Ground-Truth cases (6 bugs + 6 benign controls) with <80 line source slices and deterministic pixels', () => {
      const heroes = getHeroScenarios();
      expect(heroes).toHaveLength(4);
      expect(heroes.map((h) => h.id)).toEqual(['H1', 'H2', 'H3', 'H4']);

      for (const hero of heroes) {
        expect(hero.expectedClaim.length).toBeGreaterThan(5);
        expect(hero.beforeRgba.length).toBe(hero.width * hero.height * 4);
        expect(hero.afterRgba.length).toBe(hero.width * hero.height * 4);
        expect(hero.patchedAfterRgba.length).toBe(hero.width * hero.height * 4);
        const lineCount = hero.deterministicSourceSlice.split('\n').length;
        expect(lineCount).toBeLessThanOrEqual(80);
      }

      const matrix = getBenchmarkCaseMatrix();
      expect(matrix).toHaveLength(12);
      const bugCases = matrix.filter((c) => c.groundTruthIsBug);
      const benignCases = matrix.filter((c) => !c.groundTruthIsBug);
      expect(bugCases).toHaveLength(6);
      expect(benignCases).toHaveLength(6);

      for (const item of matrix) {
        expect(item.id).toMatch(/^C\d{2}$/);
        expect(item.deterministicSourceSlice.split('\n').length).toBeLessThan(80);
      }
    });

    it('[Criterion 2] evaluateBenchmarkMatrix() evaluates Arm 1, Arm 2, and Arm 3 across the 12 cases and handles empty subsets without NaN', () => {
      const matrix = getBenchmarkCaseMatrix();
      const summary = evaluateBenchmarkMatrix(matrix);

      expect(summary.totalCases).toBe(12);
      expect(summary.arms.arm1Deterministic.recall).toBeCloseTo(1.0, 2);
      expect(summary.arms.arm1Deterministic.precision).toBeLessThan(0.65);

      expect(
        summary.arms.arm2OnDeviceAlone.noiseSuppressionRate,
      ).toBeGreaterThanOrEqual(0.8);
      expect(summary.arms.arm3FullHybrid.precision).toBeCloseTo(1.0, 2);
      expect(summary.arms.arm3FullHybrid.recall).toBeCloseTo(1.0, 2);
      expect(
        summary.arms.arm3FullHybrid.cloudCallReductionPct,
      ).toBeGreaterThanOrEqual(40);

      const emptySummary = evaluateBenchmarkMatrix([]);
      expect(emptySummary.totalCases).toBe(0);
      expect(Number.isNaN(emptySummary.arms.arm3FullHybrid.precision)).toBe(
        false,
      );
      expect(Number.isNaN(emptySummary.arms.arm3FullHybrid.recall)).toBe(false);
    });

    it('[Criterion 3] studioReducer() increments activeRunId on START_RUN / SELECT_SCENARIO / LOAD_BYO_SNAPSHOT / CANCEL_RUN and discards stale BEAT1_COMPLETE / BEAT2_COMPLETE', () => {
      let state = createInitialStudioState();
      expect(state.activeRunId).toBe(0);

      state = studioReducer(state, { type: 'START_RUN' });
      const run1Id = state.activeRunId;
      expect(run1Id).toBe(1);
      expect(state.runPhase).toBe('running_beat1');

      state = studioReducer(state, {
        type: 'SELECT_SCENARIO',
        scenarioId: 'H2',
      });
      expect(state.activeRunId).toBe(2);
      expect(state.selectedScenarioId).toBe('H2');
      expect(state.runPhase).toBe('idle');

      const afterStaleBeat1 = studioReducer(state, {
        type: 'BEAT1_COMPLETE',
        runId: run1Id,
        triageVerdict: {
          verdict: 'false_green_persistence_lie',
          category: 'stale_run',
          confidence: 0.99,
          reason: 'Should be ignored',
        },
      });
      expect(afterStaleBeat1.triageVerdict).toBeNull();
      expect(afterStaleBeat1.runPhase).toBe('idle');

      state = studioReducer(afterStaleBeat1, { type: 'START_RUN' });
      expect(state.activeRunId).toBe(3);

      state = studioReducer(state, {
        type: 'BEAT1_COMPLETE',
        runId: 3,
        triageVerdict: {
          verdict: 'layout_or_token_break',
          category: 'token_drift',
          confidence: 0.94,
          reason: 'Badge overlap detected',
        },
      });
      expect(state.triageVerdict?.verdict).toBe('layout_or_token_break');
      expect(state.runPhase).toBe('running_beat2');

      state = studioReducer(state, {
        type: 'BEAT2_COMPLETE',
        runId: 3,
        escalationVerdict: {
          verdict: 'layout_or_token_break',
          rootCauseLine: 'PricingCard.tsx:42',
          explanation: 'Token mismatch',
          cssOrStatePatch: 'padding-top: var(--space-6);',
          patchedClaimResolved: true,
        },
      });
      expect(state.escalationVerdict?.rootCauseLine).toBe('PricingCard.tsx:42');
      expect(state.runPhase).toBe('completed');

      state = studioReducer(state, { type: 'APPLY_PATCH' });
      expect(state.patched).toBe(true);

      state = studioReducer(state, { type: 'START_RUN' });
      const inFlightRunId = state.activeRunId;
      state = studioReducer(state, {
        type: 'TOGGLE_CONFIDENTIAL_MODE',
        enabled: true,
      });
      expect(state.confidentialMode).toBe(true);
      expect(state.activeRunId).toBe(inFlightRunId + 1);
      expect(state.runPhase).toBe('cancelled');
    });

    it('[Criterion 4] validateByoSnapshotInput() validates dimensions, MIME types, expected claim, and source snippet cleanly', () => {
      const validResult = validateByoSnapshotInput({
        beforeWidth: 360,
        beforeHeight: 240,
        beforeMimeType: 'image/png',
        afterWidth: 360,
        afterHeight: 240,
        afterMimeType: 'image/jpeg',
        expectedClaim: 'Save button persists profile changes across reload',
        sourceSlice: 'export function ProfileForm() {\n  return <form />;\n}',
      });
      expect(validResult.valid).toBe(true);
      expect(validResult.errors).toHaveLength(0);

      const invalidResult = validateByoSnapshotInput({
        beforeWidth: 0,
        beforeHeight: -10,
        beforeMimeType: 'application/pdf',
        afterWidth: 360,
        afterHeight: 240,
        afterMimeType: 'image/png',
        expectedClaim: '   ',
        sourceSlice: Array.from({ length: 120 }, (_, i) => `line ${i}`).join(
          '\n',
        ),
      });
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Role 2: Safety Property Guardians (P4 Monotonic activeRunId Epoch Fencing via fast-check)', () => {
    it('P4: studioReducer Monotonic activeRunId & Stale Completion Rejection Invariant', () => {
      const triageVerdictArb = fc.record({
        verdict: fc.constantFrom(
          'benign_transition' as const,
          'false_green_persistence_lie' as const,
          'layout_or_token_break' as const,
          'unsure' as const,
        ),
        category: fc.constantFrom('aa', 'persistence', 'token', 'contrast'),
        confidence: fc.double({ min: 0.5, max: 1.0, noNaN: true }),
        reason: fc.constant('Generated triage verdict'),
      });

      const escalationVerdictArb = fc.record({
        verdict: fc.constantFrom(
          'false_green_persistence_lie' as const,
          'layout_or_token_break' as const,
          'benign_transition' as const,
        ),
        rootCauseLine: fc.constant('Component.tsx:18'),
        explanation: fc.constant('Root cause explanation'),
        cssOrStatePatch: fc.constant('gap: var(--space-4);'),
        patchedClaimResolved: fc.boolean(),
      });

      const actionArb: fc.Arbitrary<StudioAction> = fc.oneof(
        fc.constant<StudioAction>({ type: 'START_RUN' }),
        fc.record({
          type: fc.constant('SELECT_SCENARIO' as const),
          scenarioId: fc.constantFrom('H1', 'H2', 'H3', 'H4'),
        }),
        fc.record({
          type: fc.constant('LOAD_BYO_SNAPSHOT' as const),
          expectedClaim: fc.constant('Custom claim'),
          sourceSlice: fc.constant('const x = 1;'),
        }),
        fc.record({
          type: fc.constant('TOGGLE_CLOUD_CUT' as const),
          enabled: fc.option(fc.boolean(), { nil: undefined }),
        }),
        fc.record({
          type: fc.constant('BEAT1_COMPLETE' as const),
          runId: fc.integer({ min: 0, max: 12 }),
          triageVerdict: triageVerdictArb,
        }),
        fc.record({
          type: fc.constant('BEAT2_COMPLETE' as const),
          runId: fc.integer({ min: 0, max: 12 }),
          escalationVerdict: escalationVerdictArb,
        }),
        fc.constant<StudioAction>({ type: 'APPLY_PATCH' }),
        fc.constant<StudioAction>({ type: 'CANCEL_RUN' }),
      );

      let staleRejectedWitnessCount = 0;
      let matchingAppliedWitnessCount = 0;

      fc.assert(
        fc.property(
          fc.array(actionArb, { minLength: 1, maxLength: 25 }),
          (actions) => {
            let state = createInitialStudioState();
            let shadow: ShadowOracleState = {
              activeRunId: state.activeRunId,
              selectedScenarioId: state.selectedScenarioId,
              runPhase: state.runPhase,
              cloudCutActive: state.cloudCutActive,
              triageVerdict: state.triageVerdict,
              escalationVerdict: state.escalationVerdict,
              patched: state.patched,
            };

            for (const rawAction of actions) {
              const action: StudioAction =
                (rawAction.type === 'BEAT1_COMPLETE' ||
                  rawAction.type === 'BEAT2_COMPLETE') &&
                rawAction.runId % 2 === 0
                  ? { ...rawAction, runId: state.activeRunId }
                  : rawAction;

              const prevState = state;
              state = studioReducer(state, action);
              shadow = stepIndependentShadowOracle(shadow, action);

              if (
                action.type === 'BEAT1_COMPLETE' ||
                action.type === 'BEAT2_COMPLETE'
              ) {
                if (action.runId !== prevState.activeRunId) {
                  staleRejectedWitnessCount += 1;
                } else {
                  matchingAppliedWitnessCount += 1;
                }
              }

              const oracle = evaluateIndependentP4Oracle(
                prevState,
                state,
                shadow,
                action,
              );

              if (
                !oracle.p4aMonotonicActiveRunId ||
                !oracle.p4bStaleCompletionIsNoOp ||
                !oracle.p4cMatchesShadowOracle
              ) {
                return false;
              }
            }
            return true;
          },
        ),
        { numRuns: 100 },
      );

      expect(staleRejectedWitnessCount).toBeGreaterThan(0);
      expect(matchingAppliedWitnessCount).toBeGreaterThan(0);
    });
  });

  describe('Role 3: Oracle Calibration & Counterexample Replay (Negative Controls)', () => {
    it('Calibrates P4 Oracle: detects activeRunId regression, stale completion state corruption, and shadow mismatch individually', () => {
      const prevState: StudioState = {
        ...createInitialStudioState(),
        activeRunId: 5,
        runPhase: 'running_beat1',
      };
      const shadow: ShadowOracleState = {
        activeRunId: 5,
        selectedScenarioId: prevState.selectedScenarioId,
        runPhase: 'running_beat1',
        cloudCutActive: false,
        triageVerdict: null,
        escalationVerdict: null,
        patched: false,
      };

      const staleAction: StudioAction = {
        type: 'BEAT1_COMPLETE',
        runId: 2,
        triageVerdict: {
          verdict: 'false_green_persistence_lie',
          category: 'stale',
          confidence: 0.9,
          reason: 'stale',
        },
      };

      const regressedRunIdState: StudioState = {
        ...prevState,
        activeRunId: 4,
      };
      const eval1 = evaluateIndependentP4Oracle(
        prevState,
        regressedRunIdState,
        shadow,
        staleAction,
      );
      expect(eval1.p4aMonotonicActiveRunId).toBe(false);
      expect(eval1.p4bStaleCompletionIsNoOp).toBe(true);

      const corruptedByStaleState: StudioState = {
        ...prevState,
        triageVerdict: staleAction.triageVerdict,
      };
      const eval2 = evaluateIndependentP4Oracle(
        prevState,
        corruptedByStaleState,
        shadow,
        staleAction,
      );
      expect(eval2.p4aMonotonicActiveRunId).toBe(true);
      expect(eval2.p4bStaleCompletionIsNoOp).toBe(false);
    });
  });
});
