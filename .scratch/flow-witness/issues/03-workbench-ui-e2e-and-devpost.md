# 03 — 3-Beat Verification Storyboard Web UI, BYO Dropzone, Headless Playwright E2E Verification, and Devpost Package

**What to build:** Deliver the interactive Next.js + React **FlowWitness** workbench UI (`src/app/page.tsx` and studio components), including the passive **Environment Readiness Pill** (with one-click copyable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` helper), **Hybrid Telemetry HUD** (live `InferenceMode`, truthful `result.response.inferenceSource` badges, latency ms, Confidential `ONLY_ON_DEVICE` toggle, and Simulate Cloud Outage `FETCH_ERROR` toggle), the **3-Beat Verification Storyboard** (with live noise-melting animation and one-click **"Apply Patch & Re-Verify"**), the **Bring Your Own Snapshot / Code Dropzone**, the **12-Scenario Benchmark Drawer** (with **"Run 3-Scenario Live Proof"** and per-row **"Verify Live"**), the headless Playwright E2E verifier (`scripts/verify_routing_e2e.mjs`), and complete documentation (`README.md`, `README.zh-TW.md`, `devpost/DEVPOST_SUBMISSION.md`).

**Blocked by:** `02 — 4 Hero Scenarios, 12-Scenario Ground-Truth caseMatrix, 3-Arm Benchmark Evaluator, and Race-Safe studioReducer (P4)`

**Status:** `done`

**Needs:** Local Next.js server (`127.0.0.1`) and Playwright Chromium for headless E2E verification (`scripts/verify_routing_e2e.mjs`)

**Validation method:** Run `npm test`, `npm run build`, and `node scripts/verify_routing_e2e.mjs` (which boots the Next.js server on an ephemeral port and runs headless Chromium across all 4 routing & UI scenarios).

**Evidence required:** `npm test` exit code 0, `npm run build` exit code 0, and `node scripts/verify_routing_e2e.mjs` exit code 0 printing `FLOW_WITNESS_E2E_VERIFIED: 4/4 scenarios passed` and confirming `window.__FLOW_WITNESS_RECEIPTS__` contains valid receipts with `0` cloud requests leaked under `ONLY_ON_DEVICE` when `window.LanguageModel` is absent.

**Tests:** `required`

**Test seam:** `scripts/verify_routing_e2e.mjs` and public UI / receipt ledger (`window.__FLOW_WITNESS_RECEIPTS__`)

**Regression scope:** Preserve end-to-end 3-Beat verification across Hero Scenarios `H1..H4`, `ONLY_ON_DEVICE` confidential guard in a real browser without `window.LanguageModel`, `PREFER_IN_CLOUD` fault-injection fallback to `"on_device"` when a mock `window.LanguageModel` is injected, BYO Dropzone custom snapshot run, and 3-Scenario Live Proof benchmark execution — Source: Story 1, Story 2, Story 4, Story 5, Story 6, Story 7, Story 8.

- [x] [Confirmation] Opening the workbench displays the passive Environment Readiness Pill (distinguishing text vs multimodal `window.LanguageModel` readiness with a one-click copyable `chrome://flags` button), the Hybrid Telemetry HUD, and Hero Scenario `H1` ready for one-click **"Run Hybrid Verification"** (which piggybacks `initializeDeviceModel()` under a non-blocking timeout) — Source: Story 1, Story 4 — Failure: F1, F3
- [x] [Confirmation] Running `H1` (`Optimistic Save Toast vs Reload State Reversion`) and `H2` (`Responsive Pricing Token Drift`) executes Beat 0 → Beat 1 → Beat 2, displays truthful `inferenceSource` badges, and clicking **"Apply Patch & Re-Verify"** updates the target preview and reduces active contradictions from `> 0` to `0` — Source: Story 1, Story 3 — Failure: F1, F5
- [x] [Confirmation] Toggling **Confidential Mode (`ONLY_ON_DEVICE`)** in a browser without `window.LanguageModel` blocks execution with the actionable `CONFIDENTIAL_MODE_ADAPTER_MISSING` degradation card and issues `0` network requests to `firebasevertexai.googleapis.com`; toggling **Simulate Cloud Outage (`FETCH_ERROR`)** when `window.LanguageModel` is available triggers `@firebase/ai`'s native `PREFER_IN_CLOUD` fallback to `inferenceSource: "on_device"` — Source: Story 5, Story 6, Story 8 — Failure: F3, F4
- [x] [Confirmation] Submitting a custom Before/After snapshot pair and code snippet in the **Bring Your Own Snapshot / Code Dropzone** and clicking **"Run 3-Scenario Live Proof"** in the **12-Scenario Benchmark Drawer** both complete without console errors and append auditable receipts to `window.__FLOW_WITNESS_RECEIPTS__` — Source: Story 2, Story 7, Story 8 — Failure: F2, F5

## Verification Log

- **Ticket 03 Pre-UI Foundation & Tier 1 (`3a`) Mutation Verification (2026-11-10)**:
  - `ticket_base_sha`: `d59e174075d1c94caac9c2060bf6188b6eacf6fa`
  - **Tier 1 (`3a`) State & Concurrency Isolated Mutation Control**: Verified in isolated copy that mutating `action.runId !== state.activeRunId` in `studioReducer` (`P4`) and mutating `enqueueOnDeviceMutex` in `executeHybridInference` (`P2`) both fail with exit code `1` (`MUTATION_CHECK: {'p4_activeRunId_mutated_rc': 1, 'p2_mutex_mutated_rc': 1}`).
  - Initialized the reusable Playwright E2E verification recipe (`scripts/verify_routing_e2e.mjs`, `4a`) and documentation (`README.md`, `README.zh-TW.md`, `devpost/DEVPOST_SUBMISSION.md`).
- **Ticket 03 Workbench UI & E2E Verification (2026-11-10, Herdr worker)**:
  - `ticket_base_sha`: `f292b80a499cabd4c9075fec0ec6411ddfe0010a`
  - **Design source**: real model slots with honest replay labelling (worker option A), adopted through main's relay; no new verbatim user choice on this point.
  - **RED baseline**: empty app shell → `npm run verify:e2e` exit `1` (`[data-testid="readiness-pill"]` missing).
  - **Harness precondition fix (Scenario 2)**: Playwright 1.64's HeadlessChrome 151 exposes a stub `window.LanguageModel` on `127.0.0.1` (`availability()` = `downloadable`, `available` after `create()`, `prompt()` echoes its input), so Scenario 2 deletes the global in an init script to create the "browser without `window.LanguageModel`" condition of acceptance item 3 / Story 5. No assertion changed.
  - **Tracer bullets added to the verifier, each observed RED then GREEN**: T2 (Scenario 3) the Beat 2 card must show the injected on-device answer `PricingCard.tsx:42` (RED showed the replayed `PricingCard.css:42`); T1 (Scenario 1) with no Firebase env every receipt must record `actualInferenceSource: "none"` and `0` cloud calls (RED showed fabricated `in_cloud` receipts with `cloudCallsMade: 1`).
  - **GREEN**: `npm test -- --maxWorkers=3` → `19 passed (19)`; `npm run build` → exit `0`; `npm run verify:e2e` → exit `0`, `FLOW_WITNESS_E2E_VERIFIED: 4/4 scenarios passed`; `react-doctor` → `0` errors, `11` warnings.
  - **Extra checks outside the verifier**: `H2` and `H4` Apply Patch & Re-Verify take open contradictions `1 → 0`; a custom BYO file upload ends Beat 1 with "No model answered" and a `none` / `0`-cloud-call receipt; no page or console errors in any checked flow.
  - **Minor finding**: the cloud-outage fallback is executed by `executeHybridInference()` over single-target slots, not by `@firebase/ai`'s internal `callCloudOrDevice()`; without Firebase env the cloud slot throws before any request reaches `https://fault-injection.invalid`. The live Firebase path (real cloud call, App Check) is not verified because no Firebase project config is available.
  - **Minor finding**: remaining `react-doctor` warnings (control-flow complexity ×3 in `storyboard.tsx`, helper exports in `ui.tsx`, large `workbench.tsx`, intentional sequential `await` in the live proof, object-URL revoke done in a separate helper, two pre-existing `JSON.parse(JSON.stringify())` sites) are left for review.
- **Ticket 03 YAGNI Review & Trim (2026-11-10)**:
  - Executed `ticket-yagni-runner.py --manual` against `d59e174075d1c94caac9c2060bf6188b6eacf6fa` (`verdict_file`: `/Users/linhancheng/.claude/logs/ticket-yagni/d3e41a3e-d10a-4193-a28b-0ca37ca8a618/call_12289055621073662334__03/manual/verdict.json`, `counts: {"keep": 96, "demote": 19, "kill": 1}`).
  - Removed all `kill` (`CloudNotConfiguredError`) and `demote` items (`.env.example`, `src/components/receipt-ledger.tsx`, `ON_DEVICE_TIMEOUT_MS`, `NO_MEANINGFUL_CHANGE_VERDICT`, and the 15 duplicate BYO sample canvas helpers in `src/lib/byo-snapshots.ts` by reusing `getHeroScenarios()[1]` directly), and aligned `docs/glossary.md`.
  - Re-verified `npm test -- --maxWorkers=3` (`19 passed (19)`), `npm run build` (exit `0`), and `npm run verify:e2e` (`FLOW_WITNESS_E2E_VERIFIED: 4/4 scenarios passed`, exit `0`).
- **Closeout Review Reception (`typescript-reviewer` & `security-reviewer`, 2026-11-10)**:
  - `Failure-miss: F1 — initializeDeviceModelWithTimeout() lm.create() rejects after 1.5s timeout -> unhandled promise rejection`: Fixed in `src/core/flow-witness-engine.ts:463` by attaching `.catch(() => ({ initialized: false, timedOut: false }))` directly to `createPromise`.
  - `Failure-miss: F1 — ByoDropzone acceptFile() captures stale slot closure before await readSnapshotFile() and lacks unmount revoke -> stale decode overwrites newer slot and leaks ObjectURL`: Fixed in `src/components/byo-dropzone.tsx` using per-slot sequence fencing (`slotSeqRef`) and unmount cleanup (`slotsRef`).
  - `Failure-miss: F2 — parseAndValidateJson() checks required keys with 'in' operator instead of Object.hasOwn -> Object.prototype keys pass required check`: Fixed in `src/core/flow-witness-engine.ts:512` using `!Object.hasOwn(record, reqKey)`.
  - `Failure-miss: F1 — TOGGLE_CONFIDENTIAL_MODE during in-flight run does not increment activeRunId -> UI shows ONLY_ON_DEVICE while in-flight run escalates with stale confidentialMode:false`: Fixed in `src/core/studio-model.ts:144` by incrementing `activeRunId` and transitioning `runPhase` to `'cancelled'` when toggling confidential mode mid-run (with regression assertion in `tests/studio-model.test.ts`).
  - `Acceptance-miss — Ticket 01 Criterion 5 requires schemaValid:false on ON_DEVICE_PROMPT_EXCEPTION -> terminal failure paths passed reason !== 'ON_DEVICE_SCHEMA_PARSE_FAILURE' yielding schemaValid:true`: Fixed in `src/core/flow-witness-engine.ts:697,759,793` by passing `false` on all non-`ok` terminal outcomes (with regression assertion in `tests/flow-witness-engine.test.ts`).
- **Step 3.8 Architecture Visual Gate & Step 3.10 Closeout (2026-11-10)**:
  - `Architecture visual gate`: `waived` (`user: "1b, 2b, 3a"`, reason: ASCII architecture diagrams already embedded in `README.md`, `README.zh-TW.md`, and `devpost/DEVPOST_SUBMISSION.md`; `feature_base_sha`: `c566f8678a8347d72c0dd0e46a6d4d696aea688b`, `head_sha`: `d31836e770a386ebd47f9d8f1d375f07a4f7caa3`).
  - `/deep-check`: `skipped` (`user: "2b"`).

