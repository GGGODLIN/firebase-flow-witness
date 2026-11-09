# 02 — 4 Hero Scenarios, 12-Scenario Ground-Truth caseMatrix, 3-Arm Benchmark Evaluator, and Race-Safe studioReducer (P4)

**What to build:** Deliver the 4 interactive Hero Scenarios (`H1..H4`), the 12-scenario Ground-Truth `caseMatrix` (6 true bugs + 6 benign controls with deterministic Canvas renderers, DOM deltas, `<80 line` source/token slices, and patched states), the 3-Arm benchmark evaluator (`evaluateBenchmarkMatrix` comparing `Arm 1: Deterministic Rule Baseline`, `Arm 2: On-Device Triage Alone`, and `Arm 3: Full Hybrid FlowWitness` with token-bucket rate limiting), and the race-safe `studioReducer` (`src/core/studio-model.ts`) with monotonic `activeRunId` epoch fencing and BYO Snapshot / Code Dropzone validation.

**Blocked by:** `01 — HybridInferenceGateway, Dual-Target Schema Compiler, Beat 0 Pixel/DOM Diff Engine, and PBT Suite (P1..P3)`

**Status:** `ready-for-agent`

**Needs:** None — a worker can check every item unaided

**Validation method:** Run `npx vitest run tests/studio-model.test.ts` verifying concrete scenario & benchmark evaluations, `P4` state-machine sequence property tests (`fast-check`), and shadow-state oracle calibration controls.

**Evidence required:** `vitest` exit code 0 with all 12 `caseMatrix` scenarios verified across the 3 arms, `P4` monotonic `activeRunId` stale-completion rejection passing 100% of action sequences, and BYO Dropzone input validation handling malformed/empty inputs cleanly.

**Tests:** `required`

**Test seam:** `src/core/studio-model.ts` (`studioReducer`, `createInitialStudioState`, `validateByoSnapshotInput`) and `src/core/flow-witness-engine.ts` (`evaluateBenchmarkMatrix`, `getHeroScenarios`, `getBenchmarkCaseMatrix`)

**Regression scope:** Preserve `P4` (`studioReducer` monotonic `activeRunId` epoch fencing where any `BEAT1_COMPLETE` or `BEAT2_COMPLETE` action carrying `runId !== state.activeRunId` is a pure no-op against an independent shadow-state oracle) and deterministic 3-Arm precision/recall/token-saving metrics across the 12-scenario `caseMatrix` — Source: Story 1, Story 2, Story 3, Story 7.

- [ ] [Contract] `getHeroScenarios()` and `getBenchmarkCaseMatrix()` provide 4 Hero Scenarios (`H1` optimistic save lie, `H2` responsive pricing token/meaning drift, `H3` 18-region AA & timestamp benign control, `H4` `unsure` escalation control) and 12 Ground-Truth `caseMatrix` cases (6 bugs + 6 benign controls), each with deterministic `beforeCanvas`/`afterCanvas` pixel generators, `domDelta`, `<80 line` `deterministicSourceSlice`, and patched verification state — Source: Story 1, Story 3, Story 7 — Failure: F2, F5
- [ ] [Contract] `evaluateBenchmarkMatrix()` evaluates `Arm 1 (Deterministic Baseline)`, `Arm 2 (On-Device Triage Alone)`, and `Arm 3 (Full Hybrid FlowWitness)` across the 12 cases, computing exact `precision`, `recall`, `noiseSuppressionRate`, and `cloudCallReductionPct` without dividing by zero on empty subsets — Source: Story 7 — Failure: F2, F6
- [ ] [Confirmation] `studioReducer()` increments `activeRunId` on every `START_RUN`, `SELECT_SCENARIO`, `LOAD_BYO_SNAPSHOT`, or `CANCEL_RUN`, and silently discards any `BEAT1_COMPLETE` or `BEAT2_COMPLETE` action with `action.runId !== state.activeRunId` so switching scenarios mid-flight never corrupts the active view (`P4`) — Source: Story 1, Story 2 — Failure: F1
- [ ] [Confirmation] `validateByoSnapshotInput()` validates user-supplied Before/After image dimensions (`> 0`), MIME types (`image/png` or `image/jpeg`), expected claim text, and optional source/token snippet, returning structured validation errors instead of crashing on empty or unsupported files — Source: Story 2 — Failure: F2, F6

## Verification Log
