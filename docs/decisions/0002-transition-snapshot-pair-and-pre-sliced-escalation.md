# 0002 — Unified Transition Snapshot Pair, Composite Sprite-Sheet Batching, and Deterministic Pre-Sliced Tier 2 Escalation

- **Status**: Accepted
- **Date**: 2026-11-09

## Context

1. Calling `GenerativeModel.generateContent()` once per `pixelmatch` bounding box (20–50 boxes per screen) requires 20–50 sequential `LanguageModel.create()` sessions (~50–75 seconds per screen on-device, or 51–638 cloud calls across a 12-scenario benchmark when falling back to cloud on non-Nano machines).
2. In `@firebase/ai@3.0.0`, `ChromeAdapterImpl.isOnDeviceRequest()` (`index.esm.js:1048-1051`) rejects any request containing `functionResponse`, and `ChatSessionBase._sendMessage()` (`index.esm.js:2758-2823`) lacks `.catch()` recovery on `this._sendPromise`. If Tier 2 relies on multi-turn `ChatSession` Function Calling for its primary `PREFER_IN_CLOUD` call, native fallback to on-device Gemini Nano under `FETCH_ERROR` is impossible.

## Decision

1. We unify optimistic UI persistence checks and visual/token regressions into a single **Transition Snapshot Pair** (`{ expectedClaim, beforeCanvas, afterCanvas, domDelta, deterministicSourceSlice, compositeSpriteCrop }`).
2. Beat 0 uses `pixelmatch({ includeAA: false, diffMask: true })` to filter pure anti-aliasing jitter deterministically and clusters remaining changed regions into a single numbered `<= 384×384 px` composite JPEG sprite sheet (1 call per transition = 258 image tokens).
3. Beat 2 (`PREFER_IN_CLOUD`) embeds the deterministic pre-sliced component source and design token snippet (`<80 lines`) directly into a single-turn `generateContent()` request so `@firebase/ai`'s native `callCloudOrDevice()` fallback works out-of-the-box when Cloud-Cut is active, while offering an optional `ONLY_IN_CLOUD` tool-assisted deep inspect action.

## Consequences

- Per-transition Beat 1 latency drops from ~60s to ~2.5s (1 session creation, 1 image tile).
- Native `PREFER_IN_CLOUD` → `"on_device"` fallback succeeds 100% of the time without `functionResponse` rejection.
