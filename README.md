# FlowWitness — Browser-Native Hybrid UI & State Verification Workbench

[Live Workbench (`firebase-flow-witness.vercel.app`)](https://firebase-flow-witness.vercel.app) · [42s Demo Film (`youtu.be/2H3QmFD4D20`)](https://youtu.be/2H3QmFD4D20) · [繁體中文文件](https://github.com/GGGODLIN/firebase-flow-witness/blob/main/README.zh-TW.md) · [Architecture Glossary](https://github.com/GGGODLIN/firebase-flow-witness/blob/main/docs/glossary.md) · [ADR-0001: Hybrid Inference Gateway](https://github.com/GGGODLIN/firebase-flow-witness/blob/main/docs/decisions/0001-hybrid-inference-gateway-and-schema-compiler.md) · [ADR-0002: Transition Snapshot Pair](https://github.com/GGGODLIN/firebase-flow-witness/blob/main/docs/decisions/0002-transition-snapshot-pair-and-pre-sliced-escalation.md) · [Devpost Submission Writeup](https://github.com/GGGODLIN/firebase-flow-witness/blob/main/devpost/DEVPOST_SUBMISSION.md)

**FlowWitness** is a browser-native hybrid UI and state verification workbench built for the [Google #BuildHybridAI 2026 Hackathon](https://firebasehybridaihackathon.devpost.com/) using the official [Firebase AI Logic Web SDK](https://firebase.google.com/docs/ai-logic/hybrid-in-cloud-on-device) (`firebase/ai` v13.x+ / `@firebase/ai@3.0.0`) and [Firebase App Check](https://firebase.google.com/docs/app-check).

Instead of treating Chrome's Built-in Gemini Nano (`window.LanguageModel`) as a passive offline backup when Wi-Fi drops, **FlowWitness** splits visual and state verification across two complementary intelligence tiers:

1. **Beat 0 — Deterministic Pixel & DOM Diff (`0 ms`)**: Uses `pixelmatch({ threshold: 0.1, includeAA: false, diffMask: true })` to strip subpixel anti-aliasing noise deterministically, extracts DOM state deltas, and clusters remaining changed regions into a single numbered `<= 384×384 px` composite sprite sheet (`1` Gemini image tile = `258` tokens).
2. **Beat 1 — On-Device Gemini Nano Triage Sieve (`PREFER_ON_DEVICE` / `ONLY_ON_DEVICE`)**: Evaluates each transition locally in Chrome with a narrow structured JSON contract (`verdict: enum[benign_transition, false_green_persistence_lie, layout_or_token_break, unsure]`). Benign transitions melt away locally at `$0` cloud cost and `0` full-screen image uploads; only genuine contradictions or `unsure` edge cases escalate.
3. **Beat 2 — Cloud Gemini Root-Cause Diagnosis & Live Patch Re-Verification (`PREFER_IN_CLOUD`)**: Escalates flagged transitions with a deterministic pre-sliced component source and design-token snippet (`<= 80` lines) to Cloud Gemini. Clicking **Apply Patch & Re-Verify** applies the returned RFC 6902 JSON Patch to the executable example, runs its save/reload or layout rules again, renders a new frame and re-runs Beat 0 and Beat 1. Invalid patches fail visibly. If no model answers the second triage, the UI reports only the deterministic claim result.

---

## Visual Walkthrough & Demo Film

- **42-Second Launch & Demo Film**: [Watch on YouTube (`https://youtu.be/2H3QmFD4D20`)](https://youtu.be/2H3QmFD4D20)
- **Live Interactive Workbench**: [Open `https://firebase-flow-witness.vercel.app`](https://firebase-flow-witness.vercel.app)

| 1. 3-Beat Verification Storyboard (`H1` Persistence Lie) | 2. One-Click `Apply Patch & Re-Verify` (`2 → 0` Contradictions) |
| --- | --- |
| ![3-Beat Storyboard](https://github.com/GGGODLIN/firebase-flow-witness/raw/main/docs/gallery/01-three-beat-storyboard.png) | ![Patch Re-Verify](https://github.com/GGGODLIN/firebase-flow-witness/raw/main/docs/gallery/02-patch-reverify-zero.png) |
| **3. `ONLY_ON_DEVICE` Leak-Zero Guard & `PREFER_IN_CLOUD` Fallback** | **4. 12-Scenario 3-Arm Benchmark & BYO Dropzone** |
| ![Hybrid Fallback and Confidential Mode](https://github.com/GGGODLIN/firebase-flow-witness/raw/main/docs/gallery/03-hybrid-fallback-and-confidential.png) | ![Benchmark and BYO Dropzone](https://github.com/GGGODLIN/firebase-flow-witness/raw/main/docs/gallery/04-benchmark-and-byo.png) |

---

## Key Architectural Innovations Around `@firebase/ai@3.0.0`

Detailed source-level verification and trade-offs are documented in [ADR-0001](https://github.com/GGGODLIN/firebase-flow-witness/blob/main/docs/decisions/0001-hybrid-inference-gateway-and-schema-compiler.md) and [ADR-0002](https://github.com/GGGODLIN/firebase-flow-witness/blob/main/docs/decisions/0002-transition-snapshot-pair-and-pre-sliced-escalation.md):

| Engineering Challenge in `@firebase/ai@3.0.0` | FlowWitness Architectural Solution |
| --- | --- |
| **`ONLY_ON_DEVICE` Silent Cloud Leak**: When `window.LanguageModel` is undefined, `chromeAdapterFactory` returns `undefined` and `callCloudOrDevice()` executes `if (!chromeAdapter) return inCloudCall()` before checking `ONLY_ON_DEVICE`. | [src/core/flow-witness-engine.ts](https://github.com/GGGODLIN/firebase-flow-witness/blob/main/src/core/flow-witness-engine.ts) enforces an application-level guard (`CONFIDENTIAL_MODE_ADAPTER_MISSING`) that blocks execution with `0` cloud requests when `window.LanguageModel` is absent. |
| **Dual-Target `Schema.object()` Serialization**: `ObjectSchema` stores `optionalProperties` on the class instance and only converts them into standard JSON Schema `required: [...]` inside `.toJSON()`. | `buildHybridModelParams()` compiles a single `Schema.object()` into `inCloudParams.generationConfig.responseSchema` and `onDeviceParams.promptOptions.responseConstraint` via `JSON.parse(JSON.stringify(schema))` with `omitResponseConstraintInput: true`. |
| **Concurrent On-Device Session Destruction**: `ChromeAdapterImpl.createSession()` calls `this.oldSession.destroy()` on every request, aborting concurrent calls. | All hybrid inference calls pass through a `runId`-fenced concurrency-1 FIFO mutex (`maxConcurrentOnDevice <= 1`), while `studioReducer` in [src/core/studio-model.ts](https://github.com/GGGODLIN/firebase-flow-witness/blob/main/src/core/studio-model.ts) discards stale async completions (`P4`). |
| **Honest `PREFER_IN_CLOUD` Fallback Under Cloud Outage**: `ChromeAdapterImpl.isOnDeviceRequest()` rejects `functionResponse` parts, and overriding `window.fetch` breaks on-device `fetch("data:image/...")` decoding and triggers App Check's 24-hour lockout. | Beat 2 embeds pre-sliced source/tokens (`<= 80` lines) in a single-turn request. Both beats call official `getGenerativeModel()` with their requested hybrid mode and take attribution from SDK `inferenceSource`; cloud faults use per-request `SingleRequestOptions.baseUrl`. Missing configuration produces explicit replay, never a fabricated model answer. |

---

## 3-Arm Benchmark Results (12-Scenario Ground-Truth `caseMatrix`)

The following values are a simulation using recorded expected verdicts, not measured model accuracy. The pixel baseline is recomputed from rendered examples; Verify Live records real SDK results separately. Each benchmark case has independent pixels, DOM deltas and source.

| Evaluation Arm | Bug Recall (`6` Bugs) | Precision | Benign Noise Suppression (`6` Controls) | Cloud Calls Used (`12` Cases) | Cloud Call Reduction |
| --- | --- | --- | --- | --- | --- |
| **Arm 1: Deterministic Pixel/DOM Baseline** | `100.0%` (`6/6`) | `50.0%` (`6/12`) | `0.0%` (`0/6`) | `12` | `0.0%` |
| **Arm 2: On-Device Gemini Nano Triage Alone** | `100.0%` (`6/6`) | `85.7%` (`6/7`) | `83.3%` (`5/6`) | `0` | `100.0%` |
| **Arm 3: Full Hybrid FlowWitness (Beat 0 + Beat 1 + Beat 2)** | **`100.0%` (`6/6`)** | **`100.0%` (`6/6`)** | **`100.0%` (`6/6`)** | **`7`** | **`41.7%`** |

- **Recorded routing illustration**: Expected verdicts mark C03, C06 and C12 as unsure; the simulated hybrid arm resolves them using the recorded escalation answers. These are not live model precision, recall, latency or cost measurements.

---

## Quick Start & Reproducible Verification

### 1. Install & Run Unit + Property-Based Test Suite (`P1..P4`)

```bash
npm install
npm test
npm run typecheck
```

The test suite in [tests/flow-witness-engine.test.ts](https://github.com/GGGODLIN/firebase-flow-witness/blob/main/tests/flow-witness-engine.test.ts) and [tests/studio-model.test.ts](https://github.com/GGGODLIN/firebase-flow-witness/blob/main/tests/studio-model.test.ts) verifies concrete capability examples, `fast-check` property invariants (`P1..P4`), and independent oracle negative calibration controls.

### 2. Run Interactive Workbench Locally

```bash
npm run dev
```

Open `http://127.0.0.1:3000` in desktop Chrome (works out-of-the-box on any browser via hybrid fallback, or with Chrome Built-in AI enabled via `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`).

#### Connect Firebase AI Logic and mandatory App Check

Set these variables in `.env.local` locally, or in the Vercel project's Environment Variables and redeploy:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase web app API key |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Registered web app ID |
| `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY` | reCAPTCHA Enterprise site key; allow the local / deployed domains |
| `NEXT_PUBLIC_FIREBASE_AI_MODEL` | Optional cloud model override; default `gemini-3.5-flash-lite` |

The legacy `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` alias still works. Enable Firebase AI Logic with the Gemini Developer API, register the web app in App Check, and enable App Check enforcement in Firebase Console. Production and judging deployments require a reCAPTCHA Enterprise site key. Never put debug tokens in public environment variables. Only non-production `localhost` / `127.0.0.1` sessions without a site key accept the runtime `globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN` flag before the first inference; register that token in the same Firebase project. A site key takes precedence and production clears the debug flag.

Firebase and App Check initialize before the first SDK inference, including on-device inference. Missing attestation configuration fails closed. When a local model is ready, `PREFER_ON_DEVICE` uses SDK `ONLY_ON_DEVICE` for that attempt without fetching a cloud token. Other cloud-capable calls require a token before generation. Confidential `ONLY_ON_DEVICE` blocks before SDK initialization when the local model is absent. No application-level `LanguageModel.create()` warm-up runs.

Without Firebase configuration, both model tiers are off; built-in examples remain available as explicitly labelled **Deterministic Replay (No Firebase Env)**, with `actualInferenceSource: "none"`. External BYO snapshots cannot receive a replay verdict.

### 3. Run Headless Playwright E2E Verification (`4/4` Scenarios)

```bash
npm run build
npm run verify:e2e
```

The automated verifier in [scripts/verify_routing_e2e.mjs](https://github.com/GGGODLIN/firebase-flow-witness/blob/main/scripts/verify_routing_e2e.mjs) boots the production Next.js server and runs headless Chromium across all 4 verification flows, asserting `window.__FLOW_WITNESS_RECEIPTS__` integrity and `0` cloud leaks under `ONLY_ON_DEVICE`. Build without `.env.local` before running it: the verifier checks the deterministic no-Firebase path.

---

## License

Licensed under the [Apache License 2.0](https://github.com/GGGODLIN/firebase-flow-witness/blob/main/LICENSE).
