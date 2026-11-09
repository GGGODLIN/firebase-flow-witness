# `/review-brainstorm` 6-Seat Shootdown Report — `FlowWitness` (`#BuildHybridAI 2026`)

- **Date**: 2026-11-09
- **Target Repo**: `/Users/linhancheng/Desktop/projects/firebase-flow-witness`
- **Target Competition**: [Google #BuildHybridAI 2026](https://firebasehybridaihackathon.devpost.com/) (US$30,000 Cash Grand Prize, deadline Nov 30, 2026 14:00 PT)

---

## 1. Anchored Hypothesis (Refined with SDK Grounding)

Build **FlowWitness**, a browser-native hybrid UI & state verification workbench powered by the official Firebase AI Logic Web SDK (`firebase/ai` v13.x+ / `@firebase/ai@3.0.0`).
Instead of splitting into two separate tools (`FlowWitness` + `DiffJury`) or sending 30–50 separate requests per screen, **FlowWitness** unifies visual and behavioral QA around a single **Transition Snapshot Pair** (`{ expectedClaim, beforeCanvas, afterCanvas, domDelta, deterministicSourceSlice, compositeSpriteCrop }`) and a **3-Beat Verification Storyboard**:
1. **Beat 0 — Deterministic Diff & Anti-Aliasing Baseline (0 ms)**: Uses `pixelmatch({ includeAA: false, diffMask: true })` + DOM bounding-box extraction to filter pure pixel anti-aliasing jitter deterministically, clustering changed DOM regions into a single numbered `<= 384×384 px` composite JPEG sprite sheet (1 image tile = 258 tokens).
2. **Beat 1 — On-Device Semantic Triage (`PREFER_ON_DEVICE` / `ONLY_ON_DEVICE` in Confidential Mode)**: Sends 1 serialized request per transition via an application-level FIFO mutex (`concurrency = 1`) to Chrome's Built-in Gemini Nano (`window.LanguageModel`) using a dual-compiled `TriageVerdictSchema` (`verdict: enum[benign_transition, false_green_persistence_lie, layout_or_token_break, unsure]`, `reason`, `flaggedRegionIds`). Benign dynamic updates (e.g. timestamps, intentional copy) melt away locally at `$0` cloud cost and `0` cloud uploads.
3. **Beat 2 — Cloud Root-Cause & Patch Verification (`PREFER_IN_CLOUD` / `ONLY_IN_CLOUD`)**: Escalates only `false_green_persistence_lie | layout_or_token_break | unsure` items to Cloud Gemini (`gemini-3.5-flash-lite` / `gemini-3.8-flash`) with a pre-sliced AST/token context (`deterministicSourceSlice`) and dual-bound `EscalationVerdictSchema` (`responseSchema` + `.toJSON()` `responseConstraint`) so that if Cloud-Cut fault injection (`SingleRequestOptions.baseUrl`) triggers `AIError`, `@firebase/ai`'s native `callCloudOrDevice()` seamlessly falls back to on-device Gemini Nano (`inferenceSource: "on_device"`). Applying the returned patch re-renders the isolated target and re-runs Beat 0 + Beat 1 to verify zero remaining contradictions.

---

## 2. 6-Lens Reviewer Status

| Seat | Lens | Model | Status | Highest Severity Found | Key Contribution |
|---|---|---|---|---|---|
| **Seat 1** | Contrarian / YAGNI & Codebase Reuse | `opus` | `completed` | `Blocker` | Proved `pixelmatch@8.0.0` (`includeAA: false`) already handles AA jitter and returns a 1D mask (not bounding boxes); flagged dual-brand split + custom DOM automation runner as YAGNI; identified reusable studio state machine & judge bar in `~/Desktop/projects/`. |
| **Seat 2** | Cost, Quota & Token Economics | `opus` | `completed` | `Blocker` | Calculated that 1-call-per-box (30 boxes = 75s on-device, or 638 cloud calls across 15 benchmarks on non-Nano machines) blows Gemini Free Tier RPM & leaks `ImageBitmap` memory; proposed `<= 384×384 px` composite sprite-sheet batching (1 call/page) + `useLimitedUseAppCheckTokens: false`. |
| **Seat 3** | UX & Developer Ergonomics | `opus` | `completed` | `Blocker` | Flagged cognitive overload from dual `FlowWitness × DiffJury` naming and ambiguous "Before vs After" labels; designed unified **3-Beat Verification Storyboard**, single-click `initializeDeviceModel()` piggybacking (`1.5s` non-blocking timeout), and a **Bring Your Own Snapshot / Code Dropzone** so the user can test their own apps. |
| **Seat 4** | Migration, Compatibility & Rollback Safety | `opus` | `completed` | `Blocker` | Discovered 3 source-verified `@firebase/ai@3.0.0` traps in `index.esm.js`: (1) overriding `window.fetch` breaks on-device `fetch("data:image/jpeg...")` & locks App Check for 24h (`ONE_DAY`); (2) `ONLY_ON_DEVICE` silently leaks to cloud when `!window.LanguageModel` (`index.esm.js:2551`); (3) `createSession()` destroys in-flight sessions (`index.esm.js:1168`). |
| **Seat 5** | Observability & 3 AM Debuggability | `opus` | `completed` | `Blocker` | Showed Firebase Console ignores on-device calls and `ChromeAdapterImpl` hides fallback reasons in muted `logger.debug`; designed `executeHybridInference()` wrapper emitting an auditable `InferenceReceipt` ledger (`window.__FLOW_WITNESS_RECEIPTS__`) + `npm run verify:routing` Playwright check. |
| **Seat 6** | Long-Term Tech Debt & Coupling | `opus` | `completed` | `Blocker` | Discovered `Schema.object()` must call `.toJSON()` before passing to `onDeviceParams.promptOptions.responseConstraint` (`index.esm.js:4348-4372`), and proved multi-turn `FunctionResponse` is rejected by `ChromeAdapterImpl.isOnDeviceRequest` (`index.esm.js:1048`), requiring deterministic pre-sliced context for native `PREFER_IN_CLOUD` fallback. |

---

## 3. Existing Reuse Candidates (Seat 1 Inventory)

1. **Race-Safe Workbench State Machine (`activeRequestId` epoch guard)**:
   - [qnx-vss-warden/lib/studio-model.ts](file:///Users/linhancheng/Desktop/projects/qnx-vss-warden/lib/studio-model.ts) (`studio-model.ts:10-33, 72-100`) and [vultr-chart-truth/lib/studio-model.ts](file:///Users/linhancheng/Desktop/projects/vultr-chart-truth/lib/studio-model.ts) (`studio-model.ts:64-100`).
2. **Judge Walkthrough Bar & Scenario Selector Patterns**:
   - [atlassian-clause-clock/app/_studio/judge-checklist-bar.tsx](file:///Users/linhancheng/Desktop/projects/atlassian-clause-clock/app/_studio/judge-checklist-bar.tsx) (`judge-checklist-bar.tsx:11-79`).
3. **Deterministic Context Slicing Pattern (Prior to Model Call)**:
   - [gemma4-state-bridge/skills/state-bridge/scripts/statebridge_core.py](file:///Users/linhancheng/Desktop/projects/gemma4-state-bridge/skills/state-bridge/scripts/statebridge_core.py) (`build_arm_context` deterministic slice before LLM call, avoiding brittle multi-turn tool loops).
4. **E2E Contract & Case-Matrix Pattern**:
   - [e2e-contract/SKILL.md](file:///Users/linhancheng/.claude/skills/e2e-contract/SKILL.md) and [e2e-explore-then-batch/SKILL.md](file:///Users/linhancheng/.claude/skills/e2e-explore-then-batch/SKILL.md) (`caseMatrix` data-driven benchmark pattern).

---

## 4. Prioritized Objections & Contested Trade-offs

### 4.1 Consensus Fixes (Unanimously Confirmed by `@firebase/ai@3.0.0` Source Code — Auto-Adopted)

1. **`[Blocker — Seats 4, 5]` App-Level Guard for `@firebase/ai@3.0.0` `ONLY_ON_DEVICE` Silent Cloud Leak**:
   - In `@firebase/ai@3.0.0` (`index.esm.js:1219-1226, 2551-2557`), when `window.LanguageModel` is undefined, `chromeAdapterFactory` returns `undefined` and `callCloudOrDevice` executes `if (!chromeAdapter) return inCloudCall()` **before** checking `ONLY_ON_DEVICE`. Our `executeHybridInference()` wrapper MUST check `requestedMode === InferenceMode.ONLY_ON_DEVICE && typeof window.LanguageModel === 'undefined'` and block immediately with `CONFIDENTIAL_MODE_ADAPTER_MISSING` (0 cloud bytes sent).
2. **`[Blocker — Seats 2, 4, 6]` `SingleRequestOptions.baseUrl` for Fault Injection (Never Override `window.fetch`)**:
   - Because `ChromeAdapterImpl.toLanguageModelMessageContent` (`index.esm.js:1127-1135`) calls global `fetch("data:image/jpeg;base64,...")` to decode on-device images, and `@firebase/app-check` locks out for 24h (`ONE_DAY`) on mocked 403/404, Cloud-Cut fault injection MUST pass `{ baseUrl: "https://fault-injection.invalid" }` via `SingleRequestOptions` to `generateContent()`, triggering `@firebase/ai`'s native `AIError` -> `callCloudOrDevice` fallback to `"on_device"`.
3. **`[Blocker — Seats 2, 4, 6]` Single-Threaded FIFO Mutex + `<= 384×384 px` Composite Sprite-Sheet Batching**:
   - Because `ChromeAdapterImpl.createSession()` (`index.esm.js:1168`) calls `this.oldSession.destroy()` on every call, all calls must go through a concurrency-1 FIFO queue, and changed regions per transition are composited into a single numbered `<= 384×384 px` JPEG sprite sheet (1 call per checkpoint, ~2.5s latency, 258 image tokens).
4. **`[Blocker — Seats 5, 6]` Dual-Target `HybridContractCompiler` (`.toJSON()` for `responseConstraint`)**:
   - `Schema.object()` instances must be serialized via `JSON.parse(JSON.stringify(schema))` (invoking `ObjectSchema.prototype.toJSON()`, `index.esm.js:4348-4372`) before passing to `onDeviceParams.promptOptions.responseConstraint`, and both `onDeviceParams` and `inCloudParams` must be populated on every hybrid `GenerativeModel` instance so bidirectional fallback preserves structured JSON output.
5. **`[High — Seat 2]` App Check Baseline Session Token (`useLimitedUseAppCheckTokens: false`)**:
   - Avoids per-request uncached reCAPTCHA minting while still initializing real `firebase/app-check` (`initializeAppCheck` called strictly before `getAI`).

### 4.2 Contested Trade-offs (Requiring User Ratification)

- **`[Contested 1 — Seat 1 & Seat 3 vs Original Combined Framing]` Product Framing & Replay Mechanism**:
  - **Seat 1 & Seat 3**: Drop the split `FlowWitness × DiffJury` dual-brand name and drop the complex in-page DOM-event automation `reproSteps` runner; unify under a single name (**`FlowWitness`**) and a **3-Beat Transition Snapshot Storyboard** (`1. Expected / Optimistic Claim` → `2. Post-Transition Reality & On-Device Nano Triage` → `3. Cloud Root-Cause Patch & Patched Verification`), plus a **"Bring Your Own Snapshot / Component Dropzone"** so the user can drop any Before/After screenshot pair + code snippet from their own projects.
  - **Seat 4 & Seat 6**: If live component execution is kept, isolate Before/After inside separate `<iframe srcdoc>` sandboxes.
- **`[Contested 2 — Seat 1, 2, 4, 6 vs Original Tier 2 Tool Calling]` Tier 2 Context Delivery (`Deterministic Pre-Slicing` vs `Multi-Turn Function Calling`)**:
  - **Seat 1, 2, 4, 6**: In `@firebase/ai@3.0.0`, `ChromeAdapterImpl.isOnDeviceRequest()` (`index.esm.js:1048`) explicitly rejects any request containing `functionResponse`, and `generateContent()` does not auto-run tools (`ChatSession` does, at 3× token cost and permanent `_sendPromise` lockup on error). If Tier 2 uses deterministic pre-slicing (attaching the relevant `<80 line` component source & design tokens directly into a single-turn `PREFER_IN_CLOUD` request), then **native `@firebase/ai` fallback (`PREFER_IN_CLOUD` → `"on_device"` on `FETCH_ERROR`) works 100% out-of-the-box in a single call**! (Optionally, an `ONLY_IN_CLOUD` deep-dive button can still demonstrate Function Calling separately without breaking `PREFER_IN_CLOUD` fallback).
- **`[Contested 3 — Seat 1, 2, 3 vs Hard Constraint #3]` 12–15 Scenario Benchmark Suite Execution Mode**:
  - Running 15 scenarios × 3 arms live on page load or in one unthrottled click would trigger 45–150 calls and hit Gemini Free Tier RPM limits on non-Nano machines.
  - **Proposed resolution (Seats 1, 2, 3)**: Ship **4 rich interactive Hero Scenarios** in the main workspace + the full **12-scenario ground-truth `caseMatrix` Benchmark Drawer** with pre-recorded baseline metrics, a **"Run 3-Scenario Live Proof Subset (~8s)"** button, and per-row **"Verify Live"** buttons protected by a client-side token-bucket rate limiter.

---

## 5. Key Decisions Needed Before `/to-spec`

1. **Q1 — Product Unification & Personal Usability (`[Contested 1]`)**:
   - **1a (Recommended)**: Unify under the single name **`FlowWitness`** with the **3-Beat Transition Snapshot Storyboard** (covering both Optimistic UI state-persistence lies and responsive layout/token breaks as Transition Snapshot Pairs, with isolated preview + **Bring Your Own Before/After PNG & Code Dropzone** so you can use it on your own projects immediately, without building a brittle general-purpose DOM click-automation runner).
   - **1b**: Keep both the dual brand `FlowWitness × DiffJury` and build a full in-page DOM event-replay automation engine across dual `<iframe srcdoc>` containers.
2. **Q2 — Tier 2 Context & Native `PREFER_IN_CLOUD` Fallback (`[Contested 2]`)**:
   - **2a (Recommended)**: Use **Deterministic Source/Token Pre-Slicing** in the primary Tier 2 `PREFER_IN_CLOUD` call (so `@firebase/ai`'s native `callCloudOrDevice()` seamlessly falls back to `"on_device"` under `FETCH_ERROR` without crashing on `functionResponse`), and provide an optional `ONLY_IN_CLOUD` tool-assisted deep inspect action.
   - **2b**: Force multi-turn `ChatSession` Function Calling on every Tier 2 call and write a custom fallback shim when `ChatSession` fails.
3. **Q3 — Benchmark Suite UX & Quota Protection (`[Contested 3]`)**:
   - **3a (Recommended)**: **4 Interactive Hero Scenarios** in the main studio + **12-Scenario Ground-Truth Benchmark Drawer** (with pre-verified baseline table, one-click **"Run 3-Scenario Live Proof (~8s)"**, and per-row **"Verify Live"** button).
   - **3b**: Force all 12–15 scenarios to run sequentially in a single batch (~45–90 seconds).
