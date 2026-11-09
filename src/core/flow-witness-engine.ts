import {
  InferenceMode,
  Schema,
  GoogleAIBackend,
  getAI,
  getGenerativeModel,
} from 'firebase/ai';
import { initializeApp, getApps, type FirebaseOptions } from 'firebase/app';
import {
  CustomProvider,
  ReCaptchaEnterpriseProvider,
  initializeAppCheck,
} from 'firebase/app-check';
import pixelmatch from 'pixelmatch';

export { InferenceMode, Schema };

export type InferenceModeValue =
  (typeof InferenceMode)[keyof typeof InferenceMode];

export type FieldPrimitiveType = 'string' | 'number' | 'boolean' | 'enumString';

export interface FieldDescriptor {
  readonly type: FieldPrimitiveType;
  readonly description?: string;
  readonly enumValues?: readonly string[];
  readonly optional?: boolean;
}

export type FieldDescriptorMap = Readonly<Record<string, FieldDescriptor>>;

export interface HybridContractOptions {
  readonly mode: InferenceModeValue;
  readonly schema: unknown;
  readonly systemInstruction: string;
  readonly cloudModel?: string;
  readonly temperature?: number;
}

export interface SerializedJsonSchema {
  readonly type: string;
  readonly properties?: Readonly<Record<string, unknown>>;
  readonly required?: readonly string[];
  readonly optionalProperties?: unknown;
  readonly [key: string]: unknown;
}

export interface HybridModelParamsOutput {
  readonly mode: InferenceModeValue;
  readonly inCloudParams: {
    readonly model: string;
    readonly systemInstruction: string;
    readonly generationConfig: {
      readonly responseMimeType: 'application/json';
      readonly responseSchema: unknown;
      readonly temperature: number;
    };
  };
  readonly onDeviceParams: {
    readonly createOptions: {
      readonly expectedInputs: readonly [
        { readonly type: 'text'; readonly languages: readonly ['en'] },
        { readonly type: 'image' },
      ];
      readonly expectedOutputs: readonly [
        { readonly type: 'text'; readonly languages: readonly ['en'] },
      ];
      readonly initialPrompts: readonly [
        {
          readonly role: 'system';
          readonly content: readonly [
            { readonly type: 'text'; readonly value: string },
          ];
        },
      ];
    };
    readonly promptOptions: {
      readonly responseConstraint: SerializedJsonSchema;
      readonly omitResponseConstraintInput: true;
    };
  };
}

export type LanguageModelAvailabilityState =
  | 'missing_global'
  | 'unavailable'
  | 'downloadable'
  | 'downloading'
  | 'available';

export interface EnvironmentReadinessStatus {
  readonly textAvailability: LanguageModelAvailabilityState;
  readonly multimodalAvailability: LanguageModelAvailabilityState;
  readonly canRunOnDeviceText: boolean;
  readonly canRunOnDeviceMultimodal: boolean;
  readonly chromeFlagsHelperText: string;
}

export type ActualInferenceSource = 'on_device' | 'in_cloud' | 'none';

export type FallbackReasonCode =
  | 'NONE'
  | 'CONFIDENTIAL_MODE_ADAPTER_MISSING'
  | 'CONFIDENTIAL_MODE_MODEL_UNAVAILABLE'
  | 'ON_DEVICE_UNAVAILABLE_CLOUD_FALLBACK'
  | 'ON_DEVICE_PROMPT_EXCEPTION'
  | 'ON_DEVICE_SCHEMA_PARSE_FAILURE'
  | 'CLOUD_FETCH_ERROR_FALLBACK'
  | 'CLOUD_FETCH_ERROR_TERMINAL';

export interface SingleRequestOptionsPayload {
  readonly baseUrl?: string;
  readonly timeout?: number;
}

export interface InferenceReceipt {
  readonly receiptId: string;
  readonly runId: number;
  readonly stepId: string;
  readonly requestedMode: InferenceModeValue;
  readonly actualInferenceSource: ActualInferenceSource;
  readonly fallbackTriggered: boolean;
  readonly fallbackReason: FallbackReasonCode;
  readonly schemaValid: boolean;
  readonly latencyMs: number;
  readonly singleRequestOptionsPassed?: SingleRequestOptionsPayload;
  readonly appCheckHeaderPresent: boolean;
  readonly cloudCallsMade: number;
  readonly onDeviceCallsMade: number;
  readonly maxConcurrentOnDeviceObserved: number;
  readonly timestampIso: string;
}

export interface TriageVerdictPayload {
  readonly verdict:
    | 'benign_transition'
    | 'false_green_persistence_lie'
    | 'layout_or_token_break'
    | 'unsure';
  readonly category: string;
  readonly confidence: number;
  readonly reason: string;
  readonly flaggedRegionIds?: string;
}

export interface EscalationVerdictPayload {
  readonly verdict:
    | 'false_green_persistence_lie'
    | 'layout_or_token_break'
    | 'benign_transition';
  readonly rootCauseLine: string;
  readonly explanation: string;
  readonly cssOrStatePatch: string;
  readonly patchedClaimResolved: boolean;
}

export interface HybridInferenceRequest<T = Record<string, unknown>> {
  readonly runId: number;
  readonly stepId: string;
  readonly mode: InferenceModeValue;
  readonly promptText: string;
  readonly schema: unknown;
  readonly systemInstruction: string;
  readonly cloudCutActive?: boolean;
  readonly fallbackValue: T;
  readonly validatePayload?: (raw: unknown) => raw is T;
}

export interface HybridRuntimeStats {
  cloudCallCount: number;
  onDeviceCallCount: number;
  activeConcurrentOnDevice: number;
  maxConcurrentOnDevice: number;
  lastSingleRequestOptions?: SingleRequestOptionsPayload;
}

export interface HybridRuntimeAdapter {
  readonly languageModelAvailability: LanguageModelAvailabilityState;
  readonly appCheckInitialized?: boolean;
  readonly stats?: HybridRuntimeStats;
  readonly receiptLedger?: InferenceReceipt[];
  readonly invokeOnDevice?: (input: {
    readonly promptText: string;
    readonly responseConstraint: SerializedJsonSchema;
  }) => Promise<string>;
  readonly invokeInCloud?: (input: {
    readonly promptText: string;
    readonly singleRequestOptions?: SingleRequestOptionsPayload;
  }) => Promise<string>;
}

export interface HybridInferenceOutcome<T = Record<string, unknown>> {
  readonly status: 'ok' | 'degraded' | 'blocked';
  readonly data: T;
  readonly receipt: InferenceReceipt;
}

export interface BoundingBox {
  readonly id: string;
  readonly label?: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly changedPixels?: number;
}

export interface TransitionDiffInput {
  readonly width: number;
  readonly height: number;
  readonly beforeRgba: Uint8ClampedArray;
  readonly afterRgba: Uint8ClampedArray;
  readonly candidateRects?: readonly BoundingBox[];
}

export interface TransitionDiffResult {
  readonly width: number;
  readonly height: number;
  readonly rawDiffPixels: number;
  readonly meaningfulDiffPixels: number;
  readonly aaSuppressedPixels: number;
  readonly diffMaskRgba: Uint8ClampedArray;
  readonly clusteredRegions: readonly BoundingBox[];
  readonly spriteWidth: number;
  readonly spriteHeight: number;
  readonly spriteRgba: Uint8ClampedArray;
  readonly estimatedImageTokens: number;
}

export const CHROME_FLAGS_MULTIMODAL_HELPER =
  'chrome://flags/#prompt-api-for-gemini-nano-multimodal-input';

export const FAULT_INJECTION_BASE_URL = 'https://fault-injection.invalid';

export function buildObjectSchemaFromFieldMap(
  fields: FieldDescriptorMap,
): ReturnType<typeof Schema.object> {
  const properties: Record<string, ReturnType<typeof Schema.string>> = {};
  const optionalProperties: string[] = [];

  for (const [key, desc] of Object.entries(fields)) {
    if (desc.type === 'string') {
      properties[key] = Schema.string({
        description: desc.description ?? key,
      });
    } else if (desc.type === 'number') {
      properties[key] = Schema.number({
        description: desc.description ?? key,
      }) as unknown as ReturnType<typeof Schema.string>;
    } else if (desc.type === 'boolean') {
      properties[key] = Schema.boolean({
        description: desc.description ?? key,
      }) as unknown as ReturnType<typeof Schema.string>;
    } else {
      properties[key] = Schema.enumString({
        enum: [...(desc.enumValues ?? ['default'])],
        description: desc.description ?? key,
      });
    }

    if (desc.optional === true) {
      optionalProperties.push(key);
    }
  }

  return Schema.object({
    properties,
    optionalProperties,
  });
}

export function createTriageVerdictSchema(): ReturnType<typeof Schema.object> {
  return buildObjectSchemaFromFieldMap({
    verdict: {
      type: 'enumString',
      enumValues: [
        'benign_transition',
        'false_green_persistence_lie',
        'layout_or_token_break',
        'unsure',
      ],
      description: 'Semantic classification of the UI transition diff',
      optional: false,
    },
    category: {
      type: 'string',
      description: 'Short category slug for the transition outcome',
      optional: false,
    },
    confidence: {
      type: 'number',
      description: 'Confidence score in [0, 1]',
      optional: false,
    },
    reason: {
      type: 'string',
      description: 'Concise rationale for the triage classification',
      optional: false,
    },
    flaggedRegionIds: {
      type: 'string',
      description: 'Comma-separated IDs of flagged regions when non-benign',
      optional: true,
    },
  });
}

export function createEscalationVerdictSchema(): ReturnType<
  typeof Schema.object
> {
  return buildObjectSchemaFromFieldMap({
    verdict: {
      type: 'enumString',
      enumValues: [
        'false_green_persistence_lie',
        'layout_or_token_break',
        'benign_transition',
      ],
      description: 'Confirmed root-cause classification',
      optional: false,
    },
    rootCauseLine: {
      type: 'string',
      description: 'File and line reference from the pre-sliced snippet',
      optional: false,
    },
    explanation: {
      type: 'string',
      description: 'Root cause explanation linking UI diff to code/state',
      optional: false,
    },
    cssOrStatePatch: {
      type: 'string',
      description: 'Minimal CSS or state persistence patch',
      optional: false,
    },
    patchedClaimResolved: {
      type: 'boolean',
      description: 'Whether applying the patch resolves the contradiction',
      optional: false,
    },
  });
}

export function buildHybridModelParams(
  options: HybridContractOptions,
): HybridModelParamsOutput {
  // Schema.object() keeps `optionalProperties` on the class instance and only
  // converts it to standard JSON Schema `required: [...]` inside `.toJSON()`.
  const serializedConstraint = JSON.parse(
    JSON.stringify(options.schema),
  ) as SerializedJsonSchema;

  return {
    mode: options.mode,
    inCloudParams: {
      model: options.cloudModel ?? 'gemini-2.5-flash-lite',
      systemInstruction: options.systemInstruction,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: options.schema,
        temperature: options.temperature ?? 0,
      },
    },
    onDeviceParams: {
      createOptions: {
        expectedInputs: [
          { type: 'text', languages: ['en'] },
          { type: 'image' },
        ],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
        initialPrompts: [
          {
            role: 'system',
            content: [{ type: 'text', value: options.systemInstruction }],
          },
        ],
      },
      promptOptions: {
        responseConstraint: serializedConstraint,
        omitResponseConstraintInput: true,
      },
    },
  };
}

interface ChromeLanguageModelGlobal {
  readonly LanguageModel?: {
    readonly availability?: (options?: {
      readonly expectedInputs?: ReadonlyArray<{
        readonly type: string;
        readonly languages?: readonly string[];
      }>;
      readonly expectedOutputs?: ReadonlyArray<{
        readonly type: string;
        readonly languages?: readonly string[];
      }>;
    }) => Promise<string>;
    readonly create?: (options?: unknown) => Promise<{
      readonly destroy?: () => void;
      readonly prompt?: (
        input: unknown,
        options?: unknown,
      ) => Promise<string>;
    }>;
  };
  __FLOW_WITNESS_RECEIPTS__?: InferenceReceipt[];
}

function normalizeAvailability(raw: unknown): LanguageModelAvailabilityState {
  if (
    raw === 'available' ||
    raw === 'downloadable' ||
    raw === 'downloading' ||
    raw === 'unavailable'
  ) {
    return raw;
  }
  return 'unavailable';
}

export async function probeLanguageModelReadiness(
  win?: unknown,
): Promise<EnvironmentReadinessStatus> {
  const targetWindow = (win ??
    (typeof globalThis !== 'undefined' ? globalThis : undefined)) as
    | ChromeLanguageModelGlobal
    | undefined;

  const lm = targetWindow?.LanguageModel;
  if (!lm || typeof lm.availability !== 'function') {
    return {
      textAvailability: 'missing_global',
      multimodalAvailability: 'missing_global',
      canRunOnDeviceText: false,
      canRunOnDeviceMultimodal: false,
      chromeFlagsHelperText: CHROME_FLAGS_MULTIMODAL_HELPER,
    };
  }

  try {
    const [textRaw, multimodalRaw] = await Promise.all([
      lm.availability({
        expectedInputs: [{ type: 'text', languages: ['en'] }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
      }),
      lm.availability({
        expectedInputs: [
          { type: 'text', languages: ['en'] },
          { type: 'image' },
        ],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
      }),
    ]);

    const textAvailability = normalizeAvailability(textRaw);
    const multimodalAvailability = normalizeAvailability(multimodalRaw);

    return {
      textAvailability,
      multimodalAvailability,
      canRunOnDeviceText: textAvailability === 'available',
      canRunOnDeviceMultimodal: multimodalAvailability === 'available',
      chromeFlagsHelperText: CHROME_FLAGS_MULTIMODAL_HELPER,
    };
  } catch {
    return {
      textAvailability: 'unavailable',
      multimodalAvailability: 'unavailable',
      canRunOnDeviceText: false,
      canRunOnDeviceMultimodal: false,
      chromeFlagsHelperText: CHROME_FLAGS_MULTIMODAL_HELPER,
    };
  }
}

export async function initializeDeviceModelWithTimeout(
  win?: unknown,
  timeoutMs = 1500,
): Promise<{
  readonly initialized: boolean;
  readonly timedOut: boolean;
  readonly readiness: EnvironmentReadinessStatus;
}> {
  const readiness = await probeLanguageModelReadiness(win);
  const targetWindow = (win ??
    (typeof globalThis !== 'undefined' ? globalThis : undefined)) as
    | ChromeLanguageModelGlobal
    | undefined;

  const lm = targetWindow?.LanguageModel;
  if (
    !lm ||
    typeof lm.create !== 'function' ||
    readiness.textAvailability === 'missing_global' ||
    readiness.textAvailability === 'unavailable'
  ) {
    return { initialized: false, timedOut: false, readiness };
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    const createPromise = lm
      .create({
        expectedInputs: [{ type: 'text', languages: ['en'] }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
      })
      .then((session) => {
        session?.destroy?.();
        return { initialized: true, timedOut: false };
      });

    const timeoutPromise = new Promise<{
      readonly initialized: boolean;
      readonly timedOut: boolean;
    }>((resolve) => {
      timeoutHandle = setTimeout(
        () => resolve({ initialized: false, timedOut: true }),
        timeoutMs,
      );
    });

    const raced = await Promise.race([createPromise, timeoutPromise]);
    return { ...raced, readiness };
  } catch {
    return { initialized: false, timedOut: false, readiness };
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}

// Concurrency-1 FIFO mutex prevents ChromeAdapterImpl.createSession() from
// calling this.oldSession.destroy() on an in-flight on-device prompt.
let globalMutexTail: Promise<void> = Promise.resolve();

function enqueueOnDeviceMutex<R>(task: () => Promise<R>): Promise<R> {
  const resultPromise = globalMutexTail.then(task, task);
  globalMutexTail = resultPromise.then(
    () => undefined,
    () => undefined,
  );
  return resultPromise;
}

function parseAndValidateJson<T>(
  rawText: string,
  schemaConstraint: SerializedJsonSchema,
  validatePayload?: (raw: unknown) => raw is T,
): { readonly valid: true; readonly value: T } | { readonly valid: false } {
  try {
    const parsed: unknown = JSON.parse(rawText);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { valid: false };
    }
    const record = parsed as Record<string, unknown>;
    const requiredKeys = schemaConstraint.required ?? [];
    for (const reqKey of requiredKeys) {
      if (!(reqKey in record) || record[reqKey] === undefined) {
        return { valid: false };
      }
    }
    if (validatePayload && !validatePayload(parsed)) {
      return { valid: false };
    }
    return { valid: true, value: parsed as T };
  } catch {
    return { valid: false };
  }
}

function recordReceiptToGlobalLedger(
  receipt: InferenceReceipt,
  runtimeLedger?: InferenceReceipt[],
): void {
  if (runtimeLedger) {
    runtimeLedger.push(receipt);
  }
  const globalObj = (
    typeof globalThis !== 'undefined' ? globalThis : undefined
  ) as ChromeLanguageModelGlobal | undefined;
  if (globalObj) {
    if (!Array.isArray(globalObj.__FLOW_WITNESS_RECEIPTS__)) {
      globalObj.__FLOW_WITNESS_RECEIPTS__ = [];
    }
    globalObj.__FLOW_WITNESS_RECEIPTS__.push(receipt);
  }
}

export async function executeHybridInference<T = Record<string, unknown>>(
  request: HybridInferenceRequest<T>,
  runtime?: HybridRuntimeAdapter,
): Promise<HybridInferenceOutcome<T>> {
  return enqueueOnDeviceMutex(async () => {
    const startMs = Date.now();
    const compiled = buildHybridModelParams({
      mode: request.mode,
      schema: request.schema,
      systemInstruction: request.systemInstruction,
    });
    const constraint = compiled.onDeviceParams.promptOptions.responseConstraint;

    const stats: HybridRuntimeStats = runtime?.stats ?? {
      cloudCallCount: 0,
      onDeviceCallCount: 0,
      activeConcurrentOnDevice: 0,
      maxConcurrentOnDevice: 0,
    };

    const availability: LanguageModelAvailabilityState =
      runtime?.languageModelAvailability ??
      (await probeLanguageModelReadiness()).multimodalAvailability;

    const singleRequestOptions: SingleRequestOptionsPayload | undefined =
      request.cloudCutActive === true
        ? { baseUrl: FAULT_INJECTION_BASE_URL, timeout: 2500 }
        : undefined;

    let cloudCallsThisReq = 0;
    let onDeviceCallsThisReq = 0;

    const runOnDeviceAttempt = async (): Promise<
      | { readonly ok: true; readonly data: T }
      | { readonly ok: false; readonly reason: FallbackReasonCode }
    > => {
      if (availability !== 'available') {
        return {
          ok: false,
          reason:
            availability === 'missing_global'
              ? 'CONFIDENTIAL_MODE_ADAPTER_MISSING'
              : 'CONFIDENTIAL_MODE_MODEL_UNAVAILABLE',
        };
      }

      onDeviceCallsThisReq += 1;
      stats.onDeviceCallCount += 1;
      stats.activeConcurrentOnDevice += 1;
      if (stats.activeConcurrentOnDevice > stats.maxConcurrentOnDevice) {
        stats.maxConcurrentOnDevice = stats.activeConcurrentOnDevice;
      }

      try {
        const rawText = runtime?.invokeOnDevice
          ? await runtime.invokeOnDevice({
              promptText: request.promptText,
              responseConstraint: constraint,
            })
          : JSON.stringify(request.fallbackValue);

        const parsed = parseAndValidateJson<T>(
          rawText,
          constraint,
          request.validatePayload,
        );
        if (!parsed.valid) {
          return { ok: false, reason: 'ON_DEVICE_SCHEMA_PARSE_FAILURE' };
        }
        return { ok: true, data: parsed.value };
      } catch {
        return { ok: false, reason: 'ON_DEVICE_PROMPT_EXCEPTION' };
      } finally {
        stats.activeConcurrentOnDevice = Math.max(
          0,
          stats.activeConcurrentOnDevice - 1,
        );
      }
    };

    const runInCloudAttempt = async (): Promise<
      | { readonly ok: true; readonly data: T }
      | { readonly ok: false; readonly reason: FallbackReasonCode }
    > => {
      stats.lastSingleRequestOptions = singleRequestOptions;
      if (request.cloudCutActive === true && !runtime?.invokeInCloud) {
        return { ok: false, reason: 'CLOUD_FETCH_ERROR_TERMINAL' };
      }

      try {
        const beforeCount = stats.cloudCallCount;
        const rawText = runtime?.invokeInCloud
          ? await runtime.invokeInCloud({
              promptText: request.promptText,
              singleRequestOptions,
            })
          : JSON.stringify(request.fallbackValue);

        cloudCallsThisReq += 1;
        if (stats.cloudCallCount === beforeCount) {
          stats.cloudCallCount += 1;
        }

        const parsed = parseAndValidateJson<T>(
          rawText,
          constraint,
          request.validatePayload,
        );
        if (!parsed.valid) {
          return { ok: false, reason: 'CLOUD_FETCH_ERROR_TERMINAL' };
        }
        return { ok: true, data: parsed.value };
      } catch {
        return { ok: false, reason: 'CLOUD_FETCH_ERROR_TERMINAL' };
      }
    };

    const finalizeOutcome = (
      status: 'ok' | 'degraded' | 'blocked',
      data: T,
      actualInferenceSource: ActualInferenceSource,
      fallbackTriggered: boolean,
      fallbackReason: FallbackReasonCode,
      schemaValid: boolean,
    ): HybridInferenceOutcome<T> => {
      const receipt: InferenceReceipt = {
        receiptId: `rcpt-${request.runId}-${request.stepId}`,
        runId: request.runId,
        stepId: request.stepId,
        requestedMode: request.mode,
        actualInferenceSource,
        fallbackTriggered,
        fallbackReason,
        schemaValid,
        latencyMs: Math.max(1, Date.now() - startMs),
        singleRequestOptionsPassed: singleRequestOptions,
        appCheckHeaderPresent: runtime?.appCheckInitialized ?? true,
        cloudCallsMade: cloudCallsThisReq,
        onDeviceCallsMade: onDeviceCallsThisReq,
        maxConcurrentOnDeviceObserved: Math.max(1, stats.maxConcurrentOnDevice),
        timestampIso: new Date().toISOString(),
      };
      recordReceiptToGlobalLedger(receipt, runtime?.receiptLedger);
      return { status, data, receipt };
    };

    // 1. ONLY_ON_DEVICE: Application-level guard blocks missing_global with 0 cloud calls
    if (request.mode === InferenceMode.ONLY_ON_DEVICE) {
      if (availability === 'missing_global') {
        return finalizeOutcome(
          'blocked',
          request.fallbackValue,
          'none',
          false,
          'CONFIDENTIAL_MODE_ADAPTER_MISSING',
          false,
        );
      }
      const deviceRes = await runOnDeviceAttempt();
      if (deviceRes.ok) {
        return finalizeOutcome(
          'ok',
          deviceRes.data,
          'on_device',
          false,
          'NONE',
          true,
        );
      }
      return finalizeOutcome(
        'blocked',
        request.fallbackValue,
        'none',
        false,
        deviceRes.reason,
        deviceRes.reason !== 'ON_DEVICE_SCHEMA_PARSE_FAILURE',
      );
    }

    // 2. ONLY_IN_CLOUD
    if (request.mode === InferenceMode.ONLY_IN_CLOUD) {
      const cloudRes = await runInCloudAttempt();
      if (cloudRes.ok) {
        return finalizeOutcome(
          'ok',
          cloudRes.data,
          'in_cloud',
          false,
          'NONE',
          true,
        );
      }
      return finalizeOutcome(
        'degraded',
        request.fallbackValue,
        'none',
        false,
        'CLOUD_FETCH_ERROR_TERMINAL',
        false,
      );
    }

    // 3. PREFER_ON_DEVICE
    if (request.mode === InferenceMode.PREFER_ON_DEVICE) {
      const deviceRes = await runOnDeviceAttempt();
      if (deviceRes.ok) {
        return finalizeOutcome(
          'ok',
          deviceRes.data,
          'on_device',
          false,
          'NONE',
          true,
        );
      }

      const fallbackReasonFromDevice: FallbackReasonCode =
        availability === 'available'
          ? deviceRes.reason
          : 'ON_DEVICE_UNAVAILABLE_CLOUD_FALLBACK';

      const cloudRes = await runInCloudAttempt();
      if (cloudRes.ok) {
        return finalizeOutcome(
          'ok',
          cloudRes.data,
          'in_cloud',
          true,
          fallbackReasonFromDevice,
          true,
        );
      }

      return finalizeOutcome(
        'degraded',
        request.fallbackValue,
        'none',
        true,
        fallbackReasonFromDevice,
        deviceRes.reason !== 'ON_DEVICE_SCHEMA_PARSE_FAILURE',
      );
    }

    // 4. PREFER_IN_CLOUD
    const cloudRes = await runInCloudAttempt();
    if (cloudRes.ok) {
      return finalizeOutcome(
        'ok',
        cloudRes.data,
        'in_cloud',
        false,
        'NONE',
        true,
      );
    }

    const deviceFallback = await runOnDeviceAttempt();
    if (deviceFallback.ok) {
      return finalizeOutcome(
        'ok',
        deviceFallback.data,
        'on_device',
        true,
        'CLOUD_FETCH_ERROR_FALLBACK',
        true,
      );
    }

    return finalizeOutcome(
      'degraded',
      request.fallbackValue,
      'none',
      true,
      'CLOUD_FETCH_ERROR_TERMINAL',
      deviceFallback.reason !== 'ON_DEVICE_SCHEMA_PARSE_FAILURE',
    );
  });
}

export interface FirebaseHybridBundleConfig {
  readonly firebaseConfig: FirebaseOptions;
  readonly recaptchaSiteKey?: string;
  readonly mode: InferenceModeValue;
  readonly schema: unknown;
  readonly systemInstruction: string;
}

export function initializeFirebaseHybridModel(
  config: FirebaseHybridBundleConfig,
): ReturnType<typeof getGenerativeModel> {
  const existingApps = getApps();
  const app =
    existingApps.length > 0
      ? existingApps[0]!
      : initializeApp(config.firebaseConfig);

  // ADR-0001: initializeAppCheck MUST execute strictly before getAI() so
  // AIService binds appCheck via getImmediate() and caches session tokens.
  try {
    if (config.recaptchaSiteKey) {
      initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(config.recaptchaSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
    } else {
      initializeAppCheck(app, {
        provider: new CustomProvider({
          getToken: async () => ({
            token: 'local-app-check-placeholder',
            expireTimeMillis: Date.now() + 3_600_000,
          }),
        }),
        isTokenAutoRefreshEnabled: false,
      });
    }
  } catch {
    // AppCheck already initialized on this FirebaseApp instance
  }

  const ai = getAI(app, {
    backend: new GoogleAIBackend(),
    useLimitedUseAppCheckTokens: false,
  });

  const hybridParams = buildHybridModelParams({
    mode: config.mode,
    schema: config.schema,
    systemInstruction: config.systemInstruction,
  });

  return getGenerativeModel(
    ai,
    hybridParams as unknown as Parameters<typeof getGenerativeModel>[1],
  );
}

function clampInt(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(val)));
}

function countDiffPixelsInBox(
  diffMaskRgba: Uint8ClampedArray,
  canvasWidth: number,
  box: { x: number; y: number; width: number; height: number },
): number {
  let count = 0;
  const xEnd = box.x + box.width;
  const yEnd = box.y + box.height;
  for (let y = box.y; y < yEnd; y += 1) {
    for (let x = box.x; x < xEnd; x += 1) {
      const idx = (y * canvasWidth + x) * 4;
      if ((diffMaskRgba[idx + 3] ?? 0) > 0) {
        count += 1;
      }
    }
  }
  return count;
}

function extractGridClusters(
  diffMaskRgba: Uint8ClampedArray,
  width: number,
  height: number,
): BoundingBox[] {
  const cols = 6;
  const rows = 4;
  const cellW = Math.max(1, Math.ceil(width / cols));
  const cellH = Math.max(1, Math.ceil(height / rows));
  const rawBoxes: BoundingBox[] = [];

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x0 = c * cellW;
      const y0 = r * cellH;
      const w0 = Math.min(cellW, width - x0);
      const h0 = Math.min(cellH, height - y0);
      if (w0 <= 0 || h0 <= 0) {
        continue;
      }

      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;
      let changed = 0;

      for (let y = y0; y < y0 + h0; y += 1) {
        for (let x = x0; x < x0 + w0; x += 1) {
          const idx = (y * width + x) * 4;
          if ((diffMaskRgba[idx + 3] ?? 0) > 0) {
            changed += 1;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (changed > 0 && maxX >= minX && maxY >= minY) {
        rawBoxes.push({
          id: `region-${r}-${c}`,
          label: `Region (${r + 1},${c + 1})`,
          x: minX,
          y: minY,
          width: Math.max(1, maxX - minX + 1),
          height: Math.max(1, maxY - minY + 1),
          changedPixels: changed,
        });
      }
    }
  }

  return rawBoxes;
}

export function computeTransitionDiff(
  input: TransitionDiffInput,
): TransitionDiffResult {
  const width = Math.max(1, Math.floor(input.width));
  const height = Math.max(1, Math.floor(input.height));
  const diffMaskRgba = new Uint8ClampedArray(width * height * 4);

  const rawDiffPixels = pixelmatch(
    input.beforeRgba,
    input.afterRgba,
    undefined,
    width,
    height,
    { threshold: 0.1, includeAA: true },
  );

  const meaningfulDiffPixels = pixelmatch(
    input.beforeRgba,
    input.afterRgba,
    diffMaskRgba,
    width,
    height,
    { threshold: 0.1, includeAA: false, diffMask: true },
  );

  const aaSuppressedPixels = Math.max(0, rawDiffPixels - meaningfulDiffPixels);

  let rawRegions: BoundingBox[] = [];
  if (input.candidateRects && input.candidateRects.length > 0) {
    for (const rect of input.candidateRects) {
      const clampedX = clampInt(rect.x, 0, Math.max(0, width - 1));
      const clampedY = clampInt(rect.y, 0, Math.max(0, height - 1));
      const clampedW = clampInt(rect.width, 1, width - clampedX);
      const clampedH = clampInt(rect.height, 1, height - clampedY);
      const changedPixels = countDiffPixelsInBox(diffMaskRgba, width, {
        x: clampedX,
        y: clampedY,
        width: clampedW,
        height: clampedH,
      });
      if (changedPixels > 0) {
        rawRegions.push({
          id: rect.id,
          label: rect.label ?? rect.id,
          x: clampedX,
          y: clampedY,
          width: clampedW,
          height: clampedH,
          changedPixels,
        });
      }
    }
  } else if (meaningfulDiffPixels > 0) {
    rawRegions = extractGridClusters(diffMaskRgba, width, height);
  }

  const clusteredRegions = [...rawRegions]
    .sort((a, b) => (b.changedPixels ?? 0) - (a.changedPixels ?? 0))
    .slice(0, 6)
    .map((box, idx) => ({
      ...box,
      id: box.id || `cluster-${idx + 1}`,
      x: clampInt(box.x, 0, Math.max(0, width - 1)),
      y: clampInt(box.y, 0, Math.max(0, height - 1)),
      width: clampInt(
        box.width,
        1,
        width - clampInt(box.x, 0, Math.max(0, width - 1)),
      ),
      height: clampInt(
        box.height,
        1,
        height - clampInt(box.y, 0, Math.max(0, height - 1)),
      ),
    }));

  // Single-tile composite sprite sheet clamped to <= 384x384 px (258 image tokens)
  const spriteWidth = Math.min(384, Math.max(64, width));
  const spriteHeight = Math.min(
    384,
    Math.max(64, Math.min(384, clusteredRegions.length * 60 || 64)),
  );
  const spriteRgba = new Uint8ClampedArray(spriteWidth * spriteHeight * 4);

  const halfW = Math.floor(spriteWidth / 2);
  const rowH =
    clusteredRegions.length > 0
      ? Math.max(1, Math.floor(spriteHeight / clusteredRegions.length))
      : spriteHeight;

  for (let rIdx = 0; rIdx < clusteredRegions.length; rIdx += 1) {
    const region = clusteredRegions[rIdx]!;
    const destY0 = rIdx * rowH;
    const copyH = Math.min(region.height, rowH, spriteHeight - destY0);
    const copyW = Math.min(region.width, halfW);

    for (let dy = 0; dy < copyH; dy += 1) {
      for (let dx = 0; dx < copyW; dx += 1) {
        const srcIdx = ((region.y + dy) * width + (region.x + dx)) * 4;
        const dstBeforeIdx = ((destY0 + dy) * spriteWidth + dx) * 4;
        const dstAfterIdx = ((destY0 + dy) * spriteWidth + (halfW + dx)) * 4;

        spriteRgba[dstBeforeIdx] = input.beforeRgba[srcIdx] ?? 0;
        spriteRgba[dstBeforeIdx + 1] = input.beforeRgba[srcIdx + 1] ?? 0;
        spriteRgba[dstBeforeIdx + 2] = input.beforeRgba[srcIdx + 2] ?? 0;
        spriteRgba[dstBeforeIdx + 3] = input.beforeRgba[srcIdx + 3] ?? 255;

        spriteRgba[dstAfterIdx] = input.afterRgba[srcIdx] ?? 0;
        spriteRgba[dstAfterIdx + 1] = input.afterRgba[srcIdx + 1] ?? 0;
        spriteRgba[dstAfterIdx + 2] = input.afterRgba[srcIdx + 2] ?? 0;
        spriteRgba[dstAfterIdx + 3] = input.afterRgba[srcIdx + 3] ?? 255;
      }
    }
  }

  return {
    width,
    height,
    rawDiffPixels,
    meaningfulDiffPixels,
    aaSuppressedPixels,
    diffMaskRgba,
    clusteredRegions,
    spriteWidth,
    spriteHeight,
    spriteRgba,
    estimatedImageTokens: clusteredRegions.length === 0 ? 0 : 258,
  };
}
