import type { HybridInferenceOutcome } from '../core/flow-witness-engine.ts';
import type {
  EscalationVerdictPayload,
  TriageVerdictPayload,
} from '../core/studio-model.ts';
import type { AnswerOrigin } from './verification-pipeline.ts';

export interface DeviceWarmup {
  readonly initialized: boolean;
  readonly timedOut: boolean;
}

export interface TriageRecord {
  readonly kind: 'inference';
  readonly outcome: HybridInferenceOutcome<TriageVerdictPayload>;
  readonly origin: AnswerOrigin;
}

export interface EscalationRecord {
  readonly outcome: HybridInferenceOutcome<EscalationVerdictPayload>;
  readonly origin: AnswerOrigin;
}

// Telemetry of the storyboard run on screen. It is keyed by its own runId and
// survives CANCEL_RUN, so a blocked or unanswered beat stays visible.
export interface RunView {
  readonly runId: number;
  readonly pairId: string;
  readonly confidentialMode: boolean;
  readonly cloudCutActive: boolean;
  readonly warmup?: DeviceWarmup;
  readonly triage?: TriageRecord;
  readonly escalation?: EscalationRecord;
  readonly failure?: string;
}
