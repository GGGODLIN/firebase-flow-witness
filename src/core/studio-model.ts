export type StudioRunPhase =
  | 'idle'
  | 'running_beat1'
  | 'running_beat2'
  | 'completed'
  | 'cancelled';

export interface TriageVerdictPayload {
  readonly verdict:
    | 'benign_transition'
    | 'false_green_persistence_lie'
    | 'layout_or_token_break'
    | 'unsure';
  readonly category: string;
  readonly confidence: number;
  readonly reason: string;
  readonly flaggedRegionIds?: string;
}

export interface EscalationVerdictPayload {
  readonly verdict:
    | 'false_green_persistence_lie'
    | 'layout_or_token_break'
    | 'benign_transition';
  readonly rootCauseLine: string;
  readonly explanation: string;
  readonly cssOrStatePatch: string;
  readonly patchedClaimResolved: boolean;
}

export interface ByoSnapshotValidationInput {
  readonly beforeWidth: number;
  readonly beforeHeight: number;
  readonly beforeMimeType: string;
  readonly afterWidth: number;
  readonly afterHeight: number;
  readonly afterMimeType: string;
  readonly expectedClaim: string;
  readonly sourceSlice?: string;
}

export interface ByoSnapshotValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly normalizedSourceSlice: string;
}

export interface StudioState {
  readonly activeRunId: number;
  readonly selectedScenarioId: string;
  readonly runPhase: StudioRunPhase;
  readonly cloudCutActive: boolean;
  readonly confidentialMode: boolean;
  readonly triageVerdict: TriageVerdictPayload | null;
  readonly escalationVerdict: EscalationVerdictPayload | null;
  readonly patched: boolean;
  readonly customExpectedClaim?: string;
  readonly customSourceSlice?: string;
}

export type StudioAction =
  | { readonly type: 'START_RUN' }
  | { readonly type: 'SELECT_SCENARIO'; readonly scenarioId: string }
  | {
      readonly type: 'LOAD_BYO_SNAPSHOT';
      readonly expectedClaim: string;
      readonly sourceSlice?: string;
    }
  | { readonly type: 'TOGGLE_CLOUD_CUT'; readonly enabled?: boolean }
  | { readonly type: 'TOGGLE_CONFIDENTIAL_MODE'; readonly enabled?: boolean }
  | {
      readonly type: 'BEAT1_COMPLETE';
      readonly runId: number;
      readonly triageVerdict: TriageVerdictPayload;
    }
  | {
      readonly type: 'BEAT2_COMPLETE';
      readonly runId: number;
      readonly escalationVerdict: EscalationVerdictPayload;
    }
  | { readonly type: 'APPLY_PATCH' }
  | { readonly type: 'CANCEL_RUN' };

export function createInitialStudioState(): StudioState {
  return {
    activeRunId: 0,
    selectedScenarioId: 'H1',
    runPhase: 'idle',
    cloudCutActive: false,
    confidentialMode: false,
    triageVerdict: null,
    escalationVerdict: null,
    patched: false,
  };
}

export function studioReducer(
  state: Readonly<StudioState>,
  action: StudioAction,
): StudioState {
  switch (action.type) {
    case 'START_RUN':
      return {
        ...state,
        activeRunId: state.activeRunId + 1,
        runPhase: 'running_beat1',
        triageVerdict: null,
        escalationVerdict: null,
        patched: false,
      };
    case 'SELECT_SCENARIO':
      return {
        ...state,
        selectedScenarioId: action.scenarioId,
        activeRunId: state.activeRunId + 1,
        runPhase: 'idle',
        triageVerdict: null,
        escalationVerdict: null,
        patched: false,
      };
    case 'LOAD_BYO_SNAPSHOT':
      return {
        ...state,
        selectedScenarioId: 'BYO_CUSTOM',
        activeRunId: state.activeRunId + 1,
        runPhase: 'idle',
        triageVerdict: null,
        escalationVerdict: null,
        patched: false,
        customExpectedClaim: action.expectedClaim,
        customSourceSlice: action.sourceSlice,
      };
    case 'CANCEL_RUN':
      return {
        ...state,
        activeRunId: state.activeRunId + 1,
        runPhase: 'cancelled',
      };
    case 'TOGGLE_CLOUD_CUT':
      return {
        ...state,
        cloudCutActive: action.enabled ?? !state.cloudCutActive,
      };
    case 'TOGGLE_CONFIDENTIAL_MODE':
      return {
        ...state,
        confidentialMode: action.enabled ?? !state.confidentialMode,
      };
    case 'BEAT1_COMPLETE': {
      // Epoch fencing: stale completions from superseded runs are pure no-ops.
      if (action.runId !== state.activeRunId) {
        return state;
      }
      const needsEscalation =
        action.triageVerdict.verdict !== 'benign_transition';
      return {
        ...state,
        triageVerdict: action.triageVerdict,
        runPhase: needsEscalation ? 'running_beat2' : 'completed',
      };
    }
    case 'BEAT2_COMPLETE': {
      if (action.runId !== state.activeRunId) {
        return state;
      }
      return {
        ...state,
        escalationVerdict: action.escalationVerdict,
        runPhase: 'completed',
      };
    }
    case 'APPLY_PATCH': {
      if (state.escalationVerdict === null) {
        return state;
      }
      return {
        ...state,
        patched: true,
      };
    }
  }
}

export function validateByoSnapshotInput(
  input: ByoSnapshotValidationInput,
): ByoSnapshotValidationResult {
  const errors: string[] = [];

  if (
    !Number.isFinite(input.beforeWidth) ||
    !Number.isFinite(input.beforeHeight) ||
    input.beforeWidth <= 0 ||
    input.beforeHeight <= 0
  ) {
    errors.push('Before snapshot dimensions must be positive numbers (> 0).');
  }

  if (
    !Number.isFinite(input.afterWidth) ||
    !Number.isFinite(input.afterHeight) ||
    input.afterWidth <= 0 ||
    input.afterHeight <= 0
  ) {
    errors.push('After snapshot dimensions must be positive numbers (> 0).');
  }

  if (
    input.beforeMimeType !== 'image/png' &&
    input.beforeMimeType !== 'image/jpeg'
  ) {
    errors.push(
      `Unsupported Before image MIME type "${input.beforeMimeType}". Allowed: image/png, image/jpeg.`,
    );
  }

  if (
    input.afterMimeType !== 'image/png' &&
    input.afterMimeType !== 'image/jpeg'
  ) {
    errors.push(
      `Unsupported After image MIME type "${input.afterMimeType}". Allowed: image/png, image/jpeg.`,
    );
  }

  if (input.expectedClaim.trim().length === 0) {
    errors.push('Expected transition claim text cannot be empty.');
  }

  const rawSlice = (input.sourceSlice ?? '').trim();
  const sliceLines = rawSlice.length > 0 ? rawSlice.split('\n') : [];
  if (sliceLines.length > 80) {
    errors.push(
      `Component source/token slice exceeds 80 lines (${sliceLines.length} lines).`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    normalizedSourceSlice: sliceLines.slice(0, 80).join('\n'),
  };
}
