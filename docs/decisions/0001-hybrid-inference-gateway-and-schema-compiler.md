# 0001 — Application-Level `executeHybridInference` Guard, `SingleRequestOptions.baseUrl` Cloud-Cut Fault Injection, and Dual `.toJSON()` Schema Compilation Around `@firebase/ai@3.0.0`

- **Status**: Accepted
- **Date**: 2026-11-09

## Context

Inspection of `@firebase/ai@3.0.0` (`package/dist/esm/index.esm.js`) and `@firebase/app-check@0.13.1` revealed four non-obvious runtime behaviors:
1. When `window.LanguageModel` is absent, `chromeAdapterFactory` (`index.esm.js:1219-1226`) returns `undefined`, and `callCloudOrDevice` (`index.esm.js:2551-2557`) executes `if (!chromeAdapter) return inCloudCall()` **before** checking `InferenceMode.ONLY_ON_DEVICE`, causing Confidential Mode (`ONLY_ON_DEVICE`) to silently upload private screenshots to the cloud.
2. `ChromeAdapterImpl.toLanguageModelMessageContent` (`index.esm.js:1127-1135`) calls global `fetch("data:image/jpeg;base64,...")` to decode inline images on-device, and `@firebase/app-check` (`index.esm.js:1443-1460`) sets a 24-hour (`ONE_DAY`) lockout if its token endpoint receives HTTP 403/404. Overriding global `window.fetch` to simulate `FETCH_ERROR` breaks both on-device image decoding and App Check.
3. `ChromeAdapterImpl.createSession()` (`index.esm.js:1155-1173`) creates a new `LanguageModel` session on every `generateContent()` call and immediately invokes `this.oldSession.destroy()`, aborting any concurrent in-flight on-device request.
4. `Schema.object()` (`index.esm.js:4336-4373`) stores `optionalProperties` internally and only converts them into standard JSON Schema `required: [...]` when `.toJSON()` is invoked via `JSON.stringify()`. Passing an unserialized `Schema.object()` instance to `onDeviceParams.promptOptions.responseConstraint` sends a raw SDK class instance to Chrome's native `session.prompt()`.

## Decision

We route all `@firebase/ai` calls through a single `HybridInferenceGateway` (`buildHybridModelParams` + `executeHybridInference`):
1. `buildHybridModelParams` takes one `Schema.object()` definition, binds `{ responseMimeType: "application/json", responseSchema: schema }` to `inCloudParams.generationConfig`, and binds `{ responseConstraint: JSON.parse(JSON.stringify(schema)), omitResponseConstraintInput: true }` to `onDeviceParams.promptOptions`, while populating both `inCloudParams.systemInstruction` and `onDeviceParams.createOptions.initialPrompts`.
2. `executeHybridInference` enforces a preflight guard that blocks `InferenceMode.ONLY_ON_DEVICE` with `CONFIDENTIAL_MODE_ADAPTER_MISSING` whenever `window.LanguageModel` is undefined (`0` cloud bytes sent).
3. Cloud-Cut (`FETCH_ERROR`) fault injection uses `@firebase/ai`'s per-request `SingleRequestOptions.baseUrl` (`{ baseUrl: "https://fault-injection.invalid", timeout: 2500 }`) rather than mutating global `window.fetch`.
4. All calls execute through a `runId`-fenced concurrency-1 FIFO mutex and emit an immutable `InferenceReceipt`.
5. The browser runtime calls official `getGenerativeModel()` with both compiled parameter sets and the requested hybrid mode. SDK `response.inferenceSource` determines attribution; the browser runtime never invokes `LanguageModel.create()` or `session.prompt()` directly for inference.
6. App Check initializes before `getAI()`. Production requires a reCAPTCHA Enterprise site key, which takes precedence over debug flags. Only non-production localhost accepts a registered runtime `FIREBASE_APPCHECK_DEBUG_TOKEN`; tokens are never read from public build variables. Ready `PREFER_ON_DEVICE` requests are pinned to SDK `ONLY_ON_DEVICE` for that attempt without token exchange; cloud-capable attempts require `getToken()` first. Missing local models block Confidential Mode before SDK initialization. No direct application warm-up runs.

## Consequences

- Confidential Mode (`ONLY_ON_DEVICE`) is guaranteed never to leak data to the cloud on browsers without Chrome Built-in AI.
- Cloud-Cut fault injection triggers `@firebase/ai`'s real `callCloudOrDevice()` fallback path (`inferenceSource: "on_device"`) without corrupting `data:` URL image decoding or App Check token state.
- On-device calls never suffer `oldSession.destroy()` concurrent aborts.
