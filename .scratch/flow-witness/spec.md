# FlowWitness — Specification (`#BuildHybridAI 2026`)

## Problem Statement

Frontend engineers and QA testers face two high-frequency verification failures when testing web applications and reviewing UI changes:
1. **Optimistic Persistence Lies ("False Green")**: An interaction displays an immediate visual success indicator (such as a green `"Saved"` toast or updated toggle) while the underlying state fails to persist across reload or navigation, or silently mutates the wrong field.
2. **Visual & Design-Token Regressions Buried in Pixel Noise**: Pixel-level diffing (`pixelmatch`) across responsive viewports flags 20–50 changed regions per screen, 80%+ of which are benign anti-aliasing jitter, dynamic timestamps, or intentional copy updates. Sending every full screenshot and intermediate step to a cloud LLM incurs high token cost, multi-second latency, and uploads confidential/unreleased UI screens to external servers.

Existing `#BuildHybridAI 2026` entries treat Chrome's on-device Gemini Nano merely as an offline emergency backup when Wi-Fi drops. Developers need a workflow where **on-device Gemini Nano acts as the zero-upload, zero-cost narrow semantic judge (`Jev`-style fast triage sieve)** and **Cloud Gemini acts as the deep root-cause code/token diagnostician**, working together in a single verification loop that developers can also use on their own projects.

## Solution

Build **FlowWitness**, a browser-native hybrid UI & state verification workbench powered by the official Firebase AI Logic Web SDK (`firebase/ai` v13.x+ / `@firebase/ai@3.0.0`) and `firebase/app-check`.

**FlowWitness** unifies state-persistence verification and visual design-token QA around a **Transition Snapshot Pair** (`Before` vs `After`) and a **3-Beat Verification Storyboard**:
1. **Beat 0 — Deterministic Pixel & DOM Diff (`0 ms`)**: Runs `pixelmatch({ includeAA: false, diffMask: true })` to strip pure anti-aliasing jitter deterministically, extracts DOM state deltas, and spatially clusters remaining changed regions into a single numbered `<= 384×384 px` composite JPEG sprite sheet (1 Gemini image tile = 258 tokens).
2. **Beat 1 — On-Device Semantic Triage (`PREFER_ON_DEVICE` / `ONLY_ON_DEVICE` in Confidential Mode)**: Sends 1 serialized multimodal request per transition to Chrome's Built-in Gemini Nano (`window.LanguageModel`) using a dual-compiled `TriageVerdictSchema` (`verdict: enum[benign_transition, false_green_persistence_lie, layout_or_token_break, unsure]`). Benign transitions melt away locally at `$0` cloud cost and `0` full-screen uploads; only `false_green_persistence_lie`, `layout_or_token_break`, or `unsure` items escalate.
3. **Beat 2 — Cloud Root-Cause Attribution & Live Patch Verification (`PREFER_IN_CLOUD` + Optional `ONLY_IN_CLOUD` Deep Inspect)**: Escalates flagged transitions with a deterministic pre-sliced component source & design-token snippet (`<80 lines`) to Cloud Gemini (`gemini-3.5-flash-lite` / `gemini-3.8-flash`) under a dual-bound `EscalationVerdictSchema`. Clicking **"Apply Patch & Re-Verify"** renders the patched state/CSS side-by-side and re-runs Beat 0 + Beat 1 to confirm `0` remaining contradictions. Includes a **"Bring Your Own Snapshot / Code Dropzone"** for personal daily use, a live **"Simulate Cloud Outage (`FETCH_ERROR`)"** switch, and a **12-Scenario Ground-Truth Benchmark Drawer** comparing `Arm 1 (Deterministic Rule Baseline)`, `Arm 2 (On-Device Triage Alone)`, and `Arm 3 (Full Hybrid FlowWitness)`.

## User Stories

1. As a hackathon judge or frontend developer, I want a unified **FlowWitness** workbench with a **3-Beat Verification Storyboard** (`1. Expected / Optimistic Claim` → `2. Post-Transition Reality & On-Device Nano Triage` → `3. Cloud Root-Cause Patch & Patched Verification`), so that I can verify both optimistic state-persistence lies and responsive design-token breaks in under 15 seconds without cognitive overload `[user: "1a, 2a, 3a, a"]`.
2. As the developer using this tool on my own projects, I want a **"Bring Your Own Snapshot / Code Dropzone"** where I can drop or paste any `Before` + `After` screenshot pair (PNG/JPEG), DOM state summary, and component source/token snippet, so that I can run the full 3-Beat hybrid triage and get actionable CSS/state patches on my own web apps `[user: "1看起來不錯，甚至我自己都可以用"]`.
3. As a practitioner of the narrow-judge vs deep-model paradigm (`Jev × Large Model`), I want Beat 0 to handle deterministic pixel/DOM math, Beat 1 (on-device Gemini Nano) to answer a single narrow structured classification with an explicit `unsure` escalation exit (`pass | fail | unsure`), and Beat 2 (Cloud Gemini) to synthesize root-cause line numbers and patches only for escalated items, so that each model operates strictly within its physical capability boundary `[user: "是不是有點像大模型與JEV的關係？"]`.
4. As a judge testing on any desktop Chrome browser (with or without `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` enabled), I want a passive Environment Readiness Pill on page load, a one-click copyable `chrome://flags` setup helper, and single-click `initializeDeviceModel()` piggybacking (`1.5s` non-blocking timeout), so that the app never hangs on multi-GB background downloads and truthfully reports `result.response.inferenceSource` (`"on_device"` vs `"in_cloud"`) `[evidence: hybridai-docs-web-get-started.md:174-254,465-502]`.
5. As a privacy-conscious engineer testing unreleased UI in Confidential Mode (`InferenceMode.ONLY_ON_DEVICE`), I want an application-level guard that blocks execution with `CONFIDENTIAL_MODE_ADAPTER_MISSING` (`0` cloud bytes sent) if `window.LanguageModel` is unavailable, so that I am protected from `@firebase/ai@3.0.0`'s internal `if (!chromeAdapter) return inCloudCall()` silent cloud-leak bug `[evidence: @firebase/ai@3.0.0 index.esm.js:1219-1226,2551-2557]`.
6. As a judge testing resilience under network failure, I want a **"Simulate Cloud Outage (`FETCH_ERROR`)"** toggle that injects cloud failure via `@firebase/ai`'s per-request `SingleRequestOptions.baseUrl` on a single-turn `PREFER_IN_CLOUD` escalation request, so that I can observe `@firebase/ai`'s native `callCloudOrDevice()` automatically fall back to on-device Gemini Nano (`inferenceSource: "on_device"`) under the identical JSON Schema without breaking `data:` URL image decoding or App Check `[user: "1a, 2a, 3a, a"]`.
7. As a judge evaluating empirical rigor, I want 4 interactive Hero Scenarios in the main workspace plus a **12-Scenario Ground-Truth Benchmark Drawer** (with pre-verified 3-Arm baseline metrics, a **"Run 3-Scenario Live Proof (~8s)"** button, and per-row **"Verify Live"** buttons), so that I can verify Precision, Recall, Noise-Suppression Rate, and Cloud Token Savings live without hitting Gemini Free Tier RPM limits `[user: "1a, 2a, 3a, a"]`.
8. As an on-call engineer auditing routing claims, I want every hybrid inference call to append a structured `InferenceReceipt` to `window.__FLOW_WITNESS_RECEIPTS__` (with JSON export and a headless CLI verification script), so that silent fallbacks, App Check errors, or schema parse failures are diagnosable in under 60 seconds `[evidence: hybridai-docs-web-get-started.md:650-655]`.

## Implementation Decisions

- **Public Test Seam Lock**: All core verification, hybrid routing, schema compilation, benchmark evaluation, and state-machine transitions SHALL be exposed through two public modules: `src/core/flow-witness-engine.ts` and `src/core/studio-model.ts` `[user: "可以"]`.
- **Beat 0 Deterministic Pixel & DOM Diff (`computeTransitionDiff`)**:
  - Uses `pixelmatch` with `{ threshold: 0.1, includeAA: false, diffMask: true }` so pure font anti-aliasing jitter is stripped deterministically in Beat 0 before invoking any LLM `[evidence: pixelmatch@8.0.0 index.js:25-34,89-96]`.
  - Extracts changed bounding boxes by intersecting the diff mask with target DOM element rects (or grid cells for uploaded BYO images), spatially clusters nearby boxes into `<= 6` numbered regions, and renders a single composite side-by-side JPEG sprite sheet clamped to `width <= 384 && height <= 384` (guaranteeing 1 Gemini image tile = 258 tokens) `[evidence: Seat 2 & Seat 4 review in brainstorm-review-2026-11-09.md]`.
- **Dual-Target `HybridContractCompiler` (`buildHybridModelParams`)**:
  - Uses `firebase/ai`'s `Schema.object()` as the single source of truth for `TriageVerdictSchema` (Beat 1) and `EscalationVerdictSchema` (Beat 2) `[evidence: @firebase/ai@3.0.0 index.esm.js:4336-4373]`.
  - Compiles `inCloudParams` with `{ model, systemInstruction, generationConfig: { responseMimeType: "application/json", responseSchema: schema } }` and compiles `onDeviceParams` with `{ createOptions: { expectedInputs: [{ type: "text", languages: ["en"] }, { type: "image" }], expectedOutputs: [{ type: "text", languages: ["en"] }], initialPrompts: [{ role: "system", content: [{ type: "text", value: systemInstruction }] }] }, promptOptions: { responseConstraint: JSON.parse(JSON.stringify(schema)), omitResponseConstraintInput: true } }` so that `.toJSON()` converts `optionalProperties` into standard JSON Schema `required: [...]` before reaching Chrome's native `LanguageModel.prompt()` `[evidence: @firebase/ai@3.0.0 index.esm.js:1017,3413-3419,4348-4372]`.
- **Non-Bypassable `executeHybridInference()` Gateway, Confidential Guard, & Concurrency-1 Mutex**:
  - Pre-probes `window.LanguageModel?.availability()` separately for text-only and text+image multimodal inputs to populate the passive Environment Readiness Pill `[evidence: @firebase/ai@3.0.0 index.esm.js:907-910,975]`.
  - Blocks `InferenceMode.ONLY_ON_DEVICE` immediately with `CONFIDENTIAL_MODE_ADAPTER_MISSING` (`0` cloud bytes sent) if `typeof window.LanguageModel === "undefined"`, preventing `@firebase/ai@3.0.0`'s `if (!chromeAdapter) return inCloudCall()` leak `[evidence: @firebase/ai@3.0.0 index.esm.js:2551-2557]`.
  - Wraps `PREFER_ON_DEVICE` on-device execution so that if `session.prompt()` throws a runtime exception or produces truncated JSON that fails schema validation, it records `fallbackReason: "ON_DEVICE_PROMPT_EXCEPTION"` or `"ON_DEVICE_SCHEMA_PARSE_FAILURE"` and escalates cleanly instead of crashing the batch `[evidence: @firebase/ai@3.0.0 index.esm.js:2590-2600]`.
  - Serializes all calls through a `runId`-fenced concurrency-1 FIFO mutex so `ChromeAdapterImpl.createSession()` (`this.oldSession.destroy()`) never aborts an in-flight session `[evidence: @firebase/ai@3.0.0 index.esm.js:1155-1173]`.
- **Beat 2 Deterministic Pre-Slicing & Native `PREFER_IN_CLOUD` Fallback**:
  - The primary Beat 2 escalation call uses `InferenceMode.PREFER_IN_CLOUD` with deterministic pre-sliced component source (`<= 80 lines`) and design tokens embedded directly as `text` + `inlineData` (`image/jpeg`) parts (no `functionResponse` parts), ensuring `ChromeAdapterImpl.isOnDeviceRequest()` returns `true` and native fallback to on-device Gemini Nano succeeds when Cloud-Cut fault injection (`SingleRequestOptions.baseUrl = "https://fault-injection.invalid"`) is active `[user: "1a, 2a, 3a, a"]`.
  - Provides an additional optional `ONLY_IN_CLOUD` **"Deep Tool Inspect"** action that demonstrates `firebase/ai` Function Calling (`getComponentSource`, `getDesignTokens`) when online `[user: "1a, 2a, 3a, a"]`.
- **Firebase App Check Initialization Order & Session Token Caching**:
  - Initializes `initializeAppCheck(app, ...)` strictly prior to `getAI(app, { backend: new GoogleAIBackend(), useLimitedUseAppCheckTokens: false })` so `AIService` binds `appCheck` via `getImmediate()` and reuses the 1-hour cached App Check session token across benchmark runs `[evidence: @firebase/ai@3.0.0 index.esm.js:1249-1252 & @firebase/app-check@0.13.1 index.esm.js:708-746]`.
- **4 Interactive Hero Scenarios, BYO Dropzone, & 12-Scenario Ground-Truth `caseMatrix`**:
  - Ships 4 interactive Hero Scenarios in the main 3-Beat Storyboard:
    1. `H1 — Optimistic Save Toast vs Reload State Reversion` (`false_green_persistence_lie`, where a settings form shows `"Preferences Saved ✓"` while storage key reverts on reload);
    2. `H2 — Responsive Pricing Card Token & Meaning Drift` (`layout_or_token_break`, where hardcoded padding/color causes a billing badge to collide and shift visual ownership);
    3. `H3 — Subpixel Anti-Aliasing & Dynamic Timestamp Update` (`benign_transition`, where 18 pixel diff regions are filtered locally by Beat 0 + Beat 1 with `0` cloud calls);
    4. `H4 — Ambiguous Contrast / Truncated Badge Escalation` (`unsure` in Beat 1 → automatically escalated to Beat 2 Cloud Gemini to preserve 100% bug recall).
  - Ships a **12-Scenario Ground-Truth `caseMatrix`** (6 true bugs: 3 optimistic state lies + 3 layout/token breaks; 6 benign controls: 3 AA/font jitter + 3 benign copy/timestamp updates) with pre-recorded baseline metrics, a **"Run 3-Scenario Live Proof (~8s)"** button, and per-row **"Verify Live"** buttons `[user: "1a, 2a, 3a, a"]`.
  - Ships a **Bring Your Own Snapshot / Code Dropzone** supporting PNG/JPEG drag-and-drop (or paste) plus custom expected claim & source/token text `[user: "1a, 2a, 3a, a"]`.

## Testing Decisions

- **What makes a good test**: Tests verify observable behavior and invariants strictly through the agreed public seams (`src/core/flow-witness-engine.ts` and `src/core/studio-model.ts`), without mocking internal helpers or asserting tautological copies of implementation formulas.
- **Modules under test**:
  1. `src/core/flow-witness-engine.ts` (`computeTransitionDiff`, `buildHybridModelParams`, `executeHybridInference`, `evaluateBenchmarkMatrix`)
  2. `src/core/studio-model.ts` (`studioReducer`, `createInitialStudioState`)
  3. End-to-end Playwright verification (`scripts/verify_routing_e2e.mjs`) verifying live UI rendering, passive readiness pill, `ONLY_ON_DEVICE` leak-zero guard, `PREFER_IN_CLOUD` fault-injection fallback via `baseUrl`, BYO dropzone, and `window.__FLOW_WITNESS_RECEIPTS__`.
- **Conditional PBT Specification (`P1..P4` Invariants via `fast-check`)**:
  - **`P1` — Dual-Target Schema Compilation Round-Trip & Required-Field Conservation (Shape 3/4)**:
    - *Applicability domain*: Arbitrary field descriptor maps ($1..8$ fields of type `string | number | boolean | enumString` with arbitrary subsets marked optional).
    - *Invariant*: `buildHybridModelParams` outputs an `onDeviceParams.promptOptions.responseConstraint` plain JSON object where `"optionalProperties" in constraint === false`, `constraint.required` contains the exact set of non-optional keys, and `constraint` is deeply equal to `JSON.parse(JSON.stringify(inCloudParams.generationConfig.responseSchema))` and to an **Independent Oracle** that constructs the expected JSON Schema directly from the raw field descriptor map without calling `Schema.object()`.
  - **`P2` — Hybrid Routing Safety, Confidential Leak-Zero, & Concurrency-1 Mutex Invariant (Shape 1/2)**:
    - *Applicability domain*: Sequences of $1..10$ inference requests spanning all 4 `InferenceMode` values, `languageModelAvailability` $\in$ `{missing_global, unavailable, downloadable, available}`, `cloudCutActive` $\in$ `{false, true}`, and `onDeviceThrows` $\in$ `{false, true}`.
    - *Invariant*: Evaluated after every request against an **Independent Routing Oracle**: (a) whenever `mode === ONLY_ON_DEVICE` and `languageModelAvailability === "missing_global"`, `cloudCallCount` remains strictly `0` and the receipt records `CONFIDENTIAL_MODE_ADAPTER_MISSING`; (b) peak concurrent on-device calls never exceeds `1` (`maxConcurrentOnDevice <= 1`); (c) every completed receipt's `actualInferenceSource` and `fallbackTriggered` flag match the Independent Routing Oracle.
  - **`P3` — Composite Sprite Bounding & Single-Tile Token Conservation Invariant (Shape 2)**:
    - *Applicability domain*: Synthetic transition canvas pairs ($W \times H \in [120..640] \times [120..480]$) with $0..10$ injected rectangular mutations of varying sizes and positions.
    - *Invariant*: `computeTransitionDiff` emits `clusteredRegions.length <= 6`, every region's bounding box satisfies $0 \le x < x + w \le W$ and $0 \le y < y + h \le H$, and the generated composite sprite sheet dimensions satisfy `spriteWidth <= 384 && spriteHeight <= 384` (guaranteeing $\le 1$ Gemini image tile = 258 tokens) against an **Independent Geometry Oracle**.
  - **`P4` — `studioReducer` Monotonic `activeRunId` Epoch Fencing Invariant (Shape 1)**:
    - *Applicability domain*: Action sequences of `START_RUN`, `SELECT_SCENARIO`, `LOAD_BYO_SNAPSHOT`, `TOGGLE_CLOUD_CUT`, `BEAT1_COMPLETE`, `BEAT2_COMPLETE`, `APPLY_PATCH`, and `CANCEL_RUN` with arbitrary `runId` integers.
    - *Invariant*: Evaluated after every step against an **Independent Shadow-State Oracle**: `state.activeRunId` is monotonically non-decreasing on new runs, and any async completion action (`BEAT1_COMPLETE` or `BEAT2_COMPLETE`) whose `runId !== state.activeRunId` is a pure no-op on `state.triageVerdict`, `state.escalationVerdict`, and `state.patched`.

## Out of Scope

- Cross-origin browser extension injection into arbitrary third-party websites (due to Same-Origin Policy and Chrome `allow="language-model"` iframe restrictions; external app testing is served via the zero-setup **Bring Your Own Snapshot / Code Dropzone**).
- General-purpose multi-step DOM click/input automation engines (replaced by deterministic Transition Snapshot Pairs and live Before/After state/CSS patch rendering).
- Cloud video encoding or server-side database storage (all state and receipt ledgers run 100% client-side in the browser with Firebase AI Logic SDK).

## Further Notes

- Companion domain glossary: [docs/glossary.md](/docs/glossary.md)
- Companion Architecture Decision Records:
  - [ADR-0001: Hybrid Inference Gateway & Schema Compiler](/docs/decisions/0001-hybrid-inference-gateway-and-schema-compiler.md)
  - [ADR-0002: Transition Snapshot Pair & Pre-Sliced Escalation](/docs/decisions/0002-transition-snapshot-pair-and-pre-sliced-escalation.md)
