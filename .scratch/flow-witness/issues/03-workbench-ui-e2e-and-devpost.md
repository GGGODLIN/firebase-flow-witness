# 03 — 3-Beat Verification Storyboard Web UI, BYO Dropzone, Headless Playwright E2E Verification, and Devpost Package

**What to build:** Deliver the interactive Next.js + React **FlowWitness** workbench UI (`src/app/page.tsx` and studio components), including the passive **Environment Readiness Pill** (with one-click copyable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` helper), **Hybrid Telemetry HUD** (live `InferenceMode`, truthful `result.response.inferenceSource` badges, latency ms, Confidential `ONLY_ON_DEVICE` toggle, and Simulate Cloud Outage `FETCH_ERROR` toggle), the **3-Beat Verification Storyboard** (with live noise-melting animation and one-click **"Apply Patch & Re-Verify"**), the **Bring Your Own Snapshot / Code Dropzone**, the **12-Scenario Benchmark Drawer** (with **"Run 3-Scenario Live Proof"** and per-row **"Verify Live"**), the headless Playwright E2E verifier (`scripts/verify_routing_e2e.mjs`), and complete documentation (`README.md`, `README.zh-TW.md`, `devpost/DEVPOST_SUBMISSION.md`).

**Blocked by:** `02 — 4 Hero Scenarios, 12-Scenario Ground-Truth caseMatrix, 3-Arm Benchmark Evaluator, and Race-Safe studioReducer (P4)`

**Status:** `ready-for-agent`

**Needs:** Local Next.js server (`127.0.0.1`) and Playwright Chromium for headless E2E verification (`scripts/verify_routing_e2e.mjs`)

**Validation method:** Run `npm test`, `npm run build`, and `node scripts/verify_routing_e2e.mjs` (which boots the Next.js server on an ephemeral port and runs headless Chromium across all 4 routing & UI scenarios).

**Evidence required:** `npm test` exit code 0, `npm run build` exit code 0, and `node scripts/verify_routing_e2e.mjs` exit code 0 printing `FLOW_WITNESS_E2E_VERIFIED: 4/4 scenarios passed` and confirming `window.__FLOW_WITNESS_RECEIPTS__` contains valid receipts with `0` cloud requests leaked under `ONLY_ON_DEVICE` when `window.LanguageModel` is absent.

**Tests:** `required`

**Test seam:** `scripts/verify_routing_e2e.mjs` and public UI / receipt ledger (`window.__FLOW_WITNESS_RECEIPTS__`)

**Regression scope:** Preserve end-to-end 3-Beat verification across Hero Scenarios `H1..H4`, `ONLY_ON_DEVICE` confidential guard in a real browser without `window.LanguageModel`, `PREFER_IN_CLOUD` fault-injection fallback to `"on_device"` when a mock `window.LanguageModel` is injected, BYO Dropzone custom snapshot run, and 3-Scenario Live Proof benchmark execution — Source: Story 1, Story 2, Story 4, Story 5, Story 6, Story 7, Story 8.

- [ ] [Confirmation] Opening the workbench displays the passive Environment Readiness Pill (distinguishing text vs multimodal `window.LanguageModel` readiness with a one-click copyable `chrome://flags` button), the Hybrid Telemetry HUD, and Hero Scenario `H1` ready for one-click **"Run Hybrid Verification"** (which piggybacks `initializeDeviceModel()` under a non-blocking timeout) — Source: Story 1, Story 4 — Failure: F1, F3
- [ ] [Confirmation] Running `H1` (`Optimistic Save Toast vs Reload State Reversion`) and `H2` (`Responsive Pricing Token Drift`) executes Beat 0 → Beat 1 → Beat 2, displays truthful `inferenceSource` badges, and clicking **"Apply Patch & Re-Verify"** updates the target preview and reduces active contradictions from `> 0` to `0` — Source: Story 1, Story 3 — Failure: F1, F5
- [ ] [Confirmation] Toggling **Confidential Mode (`ONLY_ON_DEVICE`)** in a browser without `window.LanguageModel` blocks execution with the actionable `CONFIDENTIAL_MODE_ADAPTER_MISSING` degradation card and issues `0` network requests to `firebasevertexai.googleapis.com`; toggling **Simulate Cloud Outage (`FETCH_ERROR`)** when `window.LanguageModel` is available triggers `@firebase/ai`'s native `PREFER_IN_CLOUD` fallback to `inferenceSource: "on_device"` — Source: Story 5, Story 6, Story 8 — Failure: F3, F4
- [ ] [Confirmation] Submitting a custom Before/After snapshot pair and code snippet in the **Bring Your Own Snapshot / Code Dropzone** and clicking **"Run 3-Scenario Live Proof"** in the **12-Scenario Benchmark Drawer** both complete without console errors and append auditable receipts to `window.__FLOW_WITNESS_RECEIPTS__` — Source: Story 2, Story 7, Story 8 — Failure: F2, F5

## Verification Log

- **Ticket 03 Pre-UI Foundation & Tier 1 (`3a`) Mutation Verification (2026-11-10)**:
  - `ticket_base_sha`: `d59e174075d1c94caac9c2060bf6188b6eacf6fa`
  - **Tier 1 (`3a`) State & Concurrency Isolated Mutation Control**: Verified in isolated copy that mutating `action.runId !== state.activeRunId` in `studioReducer` (`P4`) and mutating `enqueueOnDeviceMutex` in `executeHybridInference` (`P2`) both fail with exit code `1` (`MUTATION_CHECK: {'p4_activeRunId_mutated_rc': 1, 'p2_mutex_mutated_rc': 1}`).
  - Initialized the reusable Playwright E2E verification recipe (`scripts/verify_routing_e2e.mjs`, `4a`) and documentation (`README.md`, `README.zh-TW.md`, `devpost/DEVPOST_SUBMISSION.md`).

