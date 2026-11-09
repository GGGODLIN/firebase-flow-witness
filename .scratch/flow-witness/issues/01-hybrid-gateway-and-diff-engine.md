# 01 — HybridInferenceGateway, Dual-Target Schema Compiler, Beat 0 Pixel/DOM Diff Engine, and PBT Suite (P1..P3)

**What to build:** Deliver the TypeScript project scaffold (`firebase@^13.2.0` / `@firebase/ai@^3.0.0`, `pixelmatch@^8.0.0`, `fast-check`, `vitest`, `LICENSE` Apache-2.0) and the core verification kernel (`src/core/flow-witness-engine.ts`) implementing `buildHybridModelParams()`, `executeHybridInference()`, `probeLanguageModelReadiness()`, and `computeTransitionDiff()`.

**Blocked by:** None — can start immediately

**Status:** `ready-for-agent`

**Needs:** None — a worker can check every item unaided

**Validation method:** Run `npx vitest run tests/flow-witness-engine.test.ts` verifying concrete capability examples, `P1..P3` property tests (`fast-check`), and independent oracle negative calibration controls (`Schema` compilation oracle, routing & concurrency oracle, and sprite geometry oracle).

**Evidence required:** `vitest` exit code 0 with all concrete capability tests, `P1..P3` property tests, and negative oracle calibration tests passing; `0` cloud requests issued when `InferenceMode.ONLY_ON_DEVICE` is invoked without `window.LanguageModel`.

**Tests:** `required`

**Test seam:** `src/core/flow-witness-engine.ts` (`buildHybridModelParams`, `executeHybridInference`, `probeLanguageModelReadiness`, `computeTransitionDiff`)

**Regression scope:** Preserve `P1` (dual-target `Schema.object()` compilation via `.toJSON()` stripping `optionalProperties` and matching `required` keys against an independent schema oracle), `P2` (`ONLY_ON_DEVICE` leak-zero guard when `window.LanguageModel` is missing, concurrency-1 FIFO mutex `maxConcurrentOnDevice <= 1`, and truthful `InferenceReceipt` fields matching an independent routing oracle), and `P3` (`computeTransitionDiff` clustering `<= 6` bounding boxes within canvas bounds and clamping composite sprite dimensions to `<= 384×384 px` for 1 Gemini image tile = 258 tokens) — Source: Story 3, Story 4, Story 5, Story 6, Story 8.

- [x] [Confirmation] `buildHybridModelParams()` compiles a single `Schema.object()` definition into both `inCloudParams.generationConfig` (`responseMimeType: "application/json"`, `responseSchema`) and `onDeviceParams.promptOptions` (`responseConstraint` via `.toJSON()` with zero residual `optionalProperties` keys and `omitResponseConstraintInput: true`), plus synchronized system instructions (`P1`) — Source: Story 3 — Failure: F3, F5
- [x] [Confirmation] `executeHybridInference()` blocks `InferenceMode.ONLY_ON_DEVICE` with `CONFIDENTIAL_MODE_ADAPTER_MISSING` and `0` cloud calls when `window.LanguageModel` is undefined (`P2`) — Source: Story 5 — Failure: F3, F4
- [x] [Confirmation] `executeHybridInference()` serializes concurrent hybrid requests through a `runId`-fenced concurrency-1 FIFO mutex (`maxConcurrentOnDevice <= 1`) so `ChromeAdapterImpl.createSession()` never aborts an in-flight session (`P2`) — Source: Story 4, Story 8 — Failure: F1
- [x] [Confirmation] When `cloudCutActive` is enabled on a `PREFER_IN_CLOUD` request, `executeHybridInference()` passes `SingleRequestOptions.baseUrl = "https://fault-injection.invalid"` (without mutating global `window.fetch`), triggering `@firebase/ai`'s native `callCloudOrDevice()` fallback to `"on_device"` and recording `fallbackTriggered: true` and `fallbackReason: "CLOUD_FETCH_ERROR_FALLBACK"` in `InferenceReceipt` (`P2`) — Source: Story 6, Story 8 — Failure: F3, F4
- [x] [Confirmation] When on-device `session.prompt()` throws or returns malformed/truncated JSON under `PREFER_ON_DEVICE`, `executeHybridInference()` catches the failure, records `schemaValid: false` and `fallbackReason: "ON_DEVICE_SCHEMA_PARSE_FAILURE"` or `"ON_DEVICE_PROMPT_EXCEPTION"`, and degrades cleanly to `verdict: "unsure"` or cloud fallback without crashing the batch — Source: Story 3, Story 8 — Failure: F2, F4
- [x] [Confirmation] `computeTransitionDiff()` runs `pixelmatch({ threshold: 0.1, includeAA: false, diffMask: true })`, filters pure anti-aliasing pixels deterministically, clusters changed regions into `<= 6` in-bounds boxes, and outputs a composite sprite sheet with `spriteWidth <= 384 && spriteHeight <= 384` (`P3`) — Source: Story 1, Story 3 — Failure: F2, F6

## Verification Log

- **Batch Preflight Approval (2026-11-09)**:
  - **User choice verbatim**: `"照推薦"` (`1a, 2a, 3a, 4a`)
  - **Covered tickets**: `01`, `02`, `03`
  - **Execution mode**: `1a` — Tickets `01..02` Inline; Ticket `03` (Next.js/React Web UI) via `agent-dispatch` (`opus[1m]` + `effort: max` Herdr worker)
  - **Testing mode**: `tdd` (`2a`, including conditional PBT `P1..P4`)
  - **State & concurrency verification tier**: `3a` (Tier 1: inspection + `P2/P4` `fast-check` property tests + isolated mutation negative control)
  - **Verification recipe initialization**: `4a` (`scripts/verify_routing_e2e.mjs`)
  - **Recorded `feature_base_sha`**: `c566f8678a8347d72c0dd0e46a6d4d696aea688b`
- **Ticket 01 Verification (2026-11-10)**:
  - `ticket_base_sha`: `c566f8678a8347d72c0dd0e46a6d4d696aea688b`
  - Observed RED baseline (`10 failed | 3 passed (13)` on `tests/flow-witness-engine.test.ts` with `NOT_IMPLEMENTED` stubs while Role 3 negative controls passed).
  - Implemented `src/core/flow-witness-engine.ts` and verified GREEN (`13 passed (13)` in `tests/flow-witness-engine.test.ts`, `tsc --noEmit` exit 0).

