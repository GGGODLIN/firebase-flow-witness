# 0002 — Unified Transition Snapshot Pair, Composite Sprite-Sheet Batching, and Deterministic Pre-Sliced Tier 2 Escalation

- **Status**: Accepted
- **Date**: 2026-11-09

## Context

1. Calling `GenerativeModel.generateContent()` once per `pixelmatch` bounding box (20–50 boxes per screen) requires 20–50 sequential `LanguageModel.create()` sessions (~50–75 seconds per screen on-device, or 51–638 cloud calls across a 12-scenario benchmark when falling back to cloud on non-Nano machines).
2. In `@firebase/ai@3.0.0`, `ChromeAdapterImpl.isOnDeviceRequest()` (`index.esm.js:1048-1051`) rejects any request containing `functionResponse`, and `ChatSessionBase._sendMessage()` (`index.esm.js:2758-2823`) lacks `.catch()` recovery on `this._sendPromise`. If Tier 2 relies on multi-turn `ChatSession` Function Calling for its primary `PREFER_IN_CLOUD` call, native fallback to on-device Gemini Nano under `FETCH_ERROR` is impossible.

## Decision

1. We unify optimistic UI persistence checks and visual/token regressions into a single **Transition Snapshot Pair** (`{ expectedClaim, beforeCanvas, afterCanvas, domDelta, deterministicSourceSlice, compositeSpriteCrop }`).
2. Beat 0 uses `pixelmatch({ includeAA: false, diffMask: true })` to filter pure anti-aliasing jitter deterministically and clusters remaining changed regions into a single numbered `<= 384×384 px` composite JPEG sprite sheet (1 call per transition = 258 image tokens).
3. Beat 2 (`PREFER_IN_CLOUD`) embeds the deterministic pre-sliced source and example settings (`<=80 lines`) directly in a single-turn `generateContent()` request. Native SDK fallback handles supported cloud errors; there is no separate tool-assisted deep-inspect action.
4. Every changed region is bilinearly resized with its aspect ratio preserved into its sprite slot. Large images retain the entire region rather than cropping the upper-left corner.
5. C01..C12 execute separate behavior and rendering inputs. Built-in bug patches are RFC 6902 replace operations on an allowlist of settings/style fields. The patch is applied with `fast-json-patch`, then the example reruns and renders a new image. Claim/state fields are not editable through patch operations. Invalid or ineffective patches remain failures. External BYO source runs in its owner's project, not through dynamic code evaluation in this app.
6. After a patch, Beat 0 and a new Beat 1 request run. Missing model answers are disclosed, and the deterministic claim result is kept distinct from live model confirmation.

## Consequences

- Batching limits the sprite to one image and one model request per beat; latency depends on the device, model readiness and network and is not guaranteed.
- Native `PREFER_IN_CLOUD` fallback is available for SDK-supported errors when the on-device model accepts the request. App Check token acquisition failures fail closed before model generation; they do not establish successful on-device fallback.
