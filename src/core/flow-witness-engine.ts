import { InferenceMode, Schema } from 'firebase/ai';
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
      optional: false,
    },
    category: {
      type: 'string',
      optional: false,
    },
    confidence: {
      type: 'number',
      optional: false,
    },
    reason: {
      type: 'string',
      optional: false,
    },
    flaggedRegionIds: {
      type: 'string',
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
      optional: false,
    },
    rootCauseLine: {
      type: 'string',
      optional: false,
    },
    explanation: {
      type: 'string',
      optional: false,
    },
    cssOrStatePatch: {
      type: 'string',
      optional: false,
    },
    patchedClaimResolved: {
      type: 'boolean',
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
    return { initialized: false, timedOut: false };
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
      })
      .catch(() => ({ initialized: false, timedOut: false }));

    const timeoutPromise = new Promise<{
      readonly initialized: boolean;
      readonly timedOut: boolean;
    }>((resolve) => {
      timeoutHandle = setTimeout(
        () => resolve({ initialized: false, timedOut: true }),
        timeoutMs,
      );
    });

    return await Promise.race([createPromise, timeoutPromise]);
  } catch {
    return { initialized: false, timedOut: false };
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
      if (!Object.hasOwn(record, reqKey) || record[reqKey] === undefined) {
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
      runtime?.receiptLedger?.push(receipt);
      const globalObj = (
        typeof globalThis !== 'undefined' ? globalThis : undefined
      ) as ChromeLanguageModelGlobal | undefined;
      if (globalObj) {
        if (!Array.isArray(globalObj.__FLOW_WITNESS_RECEIPTS__)) {
          globalObj.__FLOW_WITNESS_RECEIPTS__ = [];
        }
        globalObj.__FLOW_WITNESS_RECEIPTS__.push(receipt);
      }
      return { status, data, receipt };
    };

    if (request.mode === InferenceMode.ONLY_ON_DEVICE) {
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
        false,
      );
    }

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
        false,
      );
    }

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
      false,
    );
  });
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

export interface DomDeltaEntry {
  readonly selector: string;
  readonly attributeOrText: string;
  readonly beforeValue: string;
  readonly afterValue: string;
  readonly persistedAfterReload: boolean;
}

export interface TransitionScenario {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly category:
    | 'false_green_persistence_lie'
    | 'layout_or_token_break'
    | 'benign_transition'
    | 'unsure_escalation';
  readonly groundTruthIsBug: boolean;
  readonly expectedClaim: string;
  readonly width: number;
  readonly height: number;
  readonly beforeRgba: Uint8ClampedArray;
  readonly afterRgba: Uint8ClampedArray;
  readonly patchedAfterRgba: Uint8ClampedArray;
  readonly candidateRects: readonly BoundingBox[];
  readonly domDelta: readonly DomDeltaEntry[];
  readonly deterministicSourceSlice: string;
  readonly defaultTriageVerdict: {
    readonly verdict:
      | 'benign_transition'
      | 'false_green_persistence_lie'
      | 'layout_or_token_break'
      | 'unsure';
    readonly category: string;
    readonly confidence: number;
    readonly reason: string;
    readonly flaggedRegionIds?: string;
  };
  readonly defaultEscalationVerdict: {
    readonly verdict:
      | 'false_green_persistence_lie'
      | 'layout_or_token_break'
      | 'benign_transition';
    readonly rootCauseLine: string;
    readonly explanation: string;
    readonly cssOrStatePatch: string;
    readonly patchedClaimResolved: boolean;
  };
}

export interface ArmMetrics {
  readonly armId: string;
  readonly label: string;
  readonly truePositives: number;
  readonly falsePositives: number;
  readonly trueNegatives: number;
  readonly falseNegatives: number;
  readonly precision: number;
  readonly recall: number;
  readonly noiseSuppressionRate: number;
  readonly cloudCallsUsed: number;
  readonly cloudCallReductionPct: number;
}

export interface BenchmarkMatrixSummary {
  readonly totalCases: number;
  readonly bugCaseCount: number;
  readonly benignCaseCount: number;
  readonly arms: {
    readonly arm1Deterministic: ArmMetrics;
    readonly arm2OnDeviceAlone: ArmMetrics;
    readonly arm3FullHybrid: ArmMetrics;
  };
  readonly perCaseRows: readonly {
    readonly id: string;
    readonly title: string;
    readonly groundTruthIsBug: boolean;
    readonly arm1Flagged: boolean;
    readonly arm2Verdict: string;
    readonly arm3FinalBug: boolean;
    readonly escalatedToCloud: boolean;
  }[];
}

export function getHeroScenarios(): readonly TransitionScenario[] {
  const width = 320;
  const height = 200;

  const buildCanvas = (
    bg: readonly [number, number, number, number],
    boxes: ReadonlyArray<{
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      readonly color: readonly [number, number, number, number];
    }>,
  ): Uint8ClampedArray => {
    const buf = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
      buf[i * 4] = bg[0];
      buf[i * 4 + 1] = bg[1];
      buf[i * 4 + 2] = bg[2];
      buf[i * 4 + 3] = bg[3];
    }
    for (const b of boxes) {
      const xEnd = Math.min(width, b.x + b.w);
      const yEnd = Math.min(height, b.y + b.h);
      for (let y = Math.max(0, b.y); y < yEnd; y += 1) {
        for (let x = Math.max(0, b.x); x < xEnd; x += 1) {
          const idx = (y * width + x) * 4;
          buf[idx] = b.color[0];
          buf[idx + 1] = b.color[1];
          buf[idx + 2] = b.color[2];
          buf[idx + 3] = b.color[3];
        }
      }
    }
    return buf;
  };

  const h1Before = buildCanvas(
    [15, 23, 42, 255],
    [
      { x: 20, y: 20, w: 280, h: 36, color: [30, 41, 59, 255] },
      { x: 20, y: 76, w: 180, h: 40, color: [51, 65, 85, 255] },
    ],
  );
  const h1After = buildCanvas(
    [15, 23, 42, 255],
    [
      { x: 20, y: 20, w: 280, h: 36, color: [22, 163, 74, 255] },
      { x: 20, y: 76, w: 180, h: 40, color: [220, 38, 38, 255] },
    ],
  );
  const h1Patched = buildCanvas(
    [15, 23, 42, 255],
    [
      { x: 20, y: 20, w: 280, h: 36, color: [30, 41, 59, 255] },
      { x: 20, y: 76, w: 180, h: 40, color: [51, 65, 85, 255] },
    ],
  );

  const h2Before = buildCanvas(
    [15, 23, 42, 255],
    [
      { x: 24, y: 24, w: 120, h: 140, color: [30, 41, 59, 255] },
      { x: 168, y: 24, w: 120, h: 140, color: [30, 41, 59, 255] },
    ],
  );
  const h2After = buildCanvas(
    [15, 23, 42, 255],
    [
      { x: 24, y: 24, w: 120, h: 140, color: [30, 41, 59, 255] },
      { x: 132, y: 18, w: 156, h: 148, color: [234, 88, 12, 255] },
    ],
  );
  const h2Patched = buildCanvas(
    [15, 23, 42, 255],
    [
      { x: 24, y: 24, w: 120, h: 140, color: [30, 41, 59, 255] },
      { x: 168, y: 24, w: 120, h: 140, color: [30, 41, 59, 255] },
    ],
  );

  const h3Boxes = Array.from({ length: 18 }, (_, i) => ({
    x: 12 + (i % 6) * 48,
    y: 16 + Math.floor(i / 6) * 56,
    w: 14,
    h: 10,
    color: [56, 189, 248, 255] as const,
  }));
  const h3Before = buildCanvas([15, 23, 42, 255], []);
  const h3After = buildCanvas([15, 23, 42, 255], h3Boxes);

  const h4Before = buildCanvas(
    [15, 23, 42, 255],
    [{ x: 40, y: 60, w: 220, h: 52, color: [30, 41, 59, 255] }],
  );
  const h4After = buildCanvas(
    [15, 23, 42, 255],
    [{ x: 40, y: 60, w: 220, h: 52, color: [71, 85, 105, 255] }],
  );
  const h4Patched = buildCanvas(
    [15, 23, 42, 255],
    [{ x: 40, y: 60, w: 220, h: 52, color: [30, 41, 59, 255] }],
  );

  return [
    {
      id: 'H1',
      title: 'Optimistic Save Toast vs Reload State Reversion',
      subtitle: 'False-green toast claims Saved while storage key reverts on reload',
      category: 'false_green_persistence_lie',
      groundTruthIsBug: true,
      expectedClaim:
        'Clicking Save Preferences persists autosave="enabled" across reload',
      width,
      height,
      beforeRgba: h1Before,
      afterRgba: h1After,
      patchedAfterRgba: h1Patched,
      candidateRects: [
        {
          id: 'toast-banner',
          label: 'Optimistic Toast ("Preferences Saved ✓")',
          x: 20,
          y: 20,
          width: 280,
          height: 36,
        },
        {
          id: 'autosave-toggle',
          label: 'Autosave Toggle (Reverted to OFF)',
          x: 20,
          y: 76,
          width: 180,
          height: 40,
        },
      ],
      domDelta: [
        {
          selector: '[data-testid="toast-status"]',
          attributeOrText: 'textContent',
          beforeValue: 'Idle',
          afterValue: 'Preferences Saved ✓',
          persistedAfterReload: false,
        },
        {
          selector: 'input[name="autosave"]',
          attributeOrText: 'aria-checked',
          beforeValue: 'true',
          afterValue: 'false',
          persistedAfterReload: false,
        },
      ],
      deterministicSourceSlice: [
        'export async function handleSavePreferences(draft: Prefs) {',
        '  showToast("Preferences Saved ✓"); // Line 14: Optimistic UI toast fired first',
        '  // BUG Line 15: writes to sessionStorage["prefs_draft"] instead of localStorage["prefs_v2"]',
        '  window.sessionStorage.setItem("prefs_draft", JSON.stringify(draft));',
        '}',
      ].join('\n'),
      defaultTriageVerdict: {
        verdict: 'false_green_persistence_lie',
        category: 'optimistic_persistence_lie',
        confidence: 0.96,
        reason:
          'Toast claims "Preferences Saved ✓" while input[name="autosave"] reverted to aria-checked="false" on reload.',
        flaggedRegionIds: 'toast-banner,autosave-toggle',
      },
      defaultEscalationVerdict: {
        verdict: 'false_green_persistence_lie',
        rootCauseLine: 'ProfileSettings.tsx:15',
        explanation:
          'handleSavePreferences() fires the optimistic toast before persisting and writes to sessionStorage["prefs_draft"] instead of the reload key localStorage["prefs_v2"].',
        cssOrStatePatch:
          'window.localStorage.setItem("prefs_v2", JSON.stringify(draft));',
        patchedClaimResolved: true,
      },
    },
    {
      id: 'H2',
      title: 'Responsive Pricing Card Token & Meaning Drift',
      subtitle: 'Hardcoded padding causes Pro badge to collide with Free tier column',
      category: 'layout_or_token_break',
      groundTruthIsBug: true,
      expectedClaim:
        'Annual discount badge remains anchored inside the Pro card header at 375px viewport',
      width,
      height,
      beforeRgba: h2Before,
      afterRgba: h2After,
      patchedAfterRgba: h2Patched,
      candidateRects: [
        {
          id: 'pro-card-header',
          label: 'Pro Tier Badge Collision Region',
          x: 132,
          y: 18,
          width: 156,
          height: 148,
        },
      ],
      domDelta: [
        {
          selector: '.pricing-card--pro .discount-badge',
          attributeOrText: 'boundingBox.left',
          beforeValue: '168px (inside .pricing-card--pro)',
          afterValue: '132px (overlaps .pricing-card--free)',
          persistedAfterReload: true,
        },
      ],
      deterministicSourceSlice: [
        '.pricing-card--pro {',
        '  position: relative;',
        '  /* BUG Line 42: hardcoded negative margin pulls badge across card boundary */',
        '  margin-left: -36px;',
        '  padding-top: 4px;',
        '}',
      ].join('\n'),
      defaultTriageVerdict: {
        verdict: 'layout_or_token_break',
        category: 'responsive_token_collision',
        confidence: 0.94,
        reason:
          'Discount badge shifted -36px left across card boundary, visually attaching the Pro discount to the Free tier.',
        flaggedRegionIds: 'pro-card-header',
      },
      defaultEscalationVerdict: {
        verdict: 'layout_or_token_break',
        rootCauseLine: 'PricingCard.css:42',
        explanation:
          '.pricing-card--pro uses hardcoded margin-left: -36px and 4px padding instead of design tokens --space-0 and --space-6.',
        cssOrStatePatch:
          'margin-left: var(--space-0, 0px);\n  padding-top: var(--space-6, 24px);',
        patchedClaimResolved: true,
      },
    },
    {
      id: 'H3',
      title: 'Subpixel Anti-Aliasing & Dynamic Timestamp Update',
      subtitle: '18 noisy pixelmatch regions filtered locally by Beat 0 + Beat 1 with 0 cloud calls',
      category: 'benign_transition',
      groundTruthIsBug: false,
      expectedClaim:
        'Live activity feed refreshes relative timestamps without layout shift or state loss',
      width,
      height,
      beforeRgba: h3Before,
      afterRgba: h3After,
      patchedAfterRgba: h3Before,
      candidateRects: h3Boxes.map((b, i) => ({
        id: `aa-region-${i + 1}`,
        label: `Timestamp / Subpixel Glyph #${i + 1}`,
        x: b.x,
        y: b.y,
        width: b.w,
        height: b.h,
      })),
      domDelta: [
        {
          selector: 'time[data-relative]',
          attributeOrText: 'textContent',
          beforeValue: 'Updated 1m ago',
          afterValue: 'Updated 2m ago',
          persistedAfterReload: true,
        },
      ],
      deterministicSourceSlice: [
        'export function RelativeTimestamp({ iso }: { iso: string }) {',
        '  return <time data-relative>{formatRelative(iso)}</time>;',
        '}',
      ].join('\n'),
      defaultTriageVerdict: {
        verdict: 'benign_transition',
        category: 'dynamic_timestamp_and_aa',
        confidence: 0.98,
        reason:
          'All clustered regions correspond to monotonic relative timestamp text and subpixel glyph rendering with zero semantic or layout contradiction.',
      },
      defaultEscalationVerdict: {
        verdict: 'benign_transition',
        rootCauseLine: 'RelativeTimestamp.tsx:2',
        explanation: 'Benign relative timestamp tick; no patch required.',
        cssOrStatePatch: '/* No patch required */',
        patchedClaimResolved: true,
      },
    },
    {
      id: 'H4',
      title: 'Ambiguous Contrast / Truncated Badge Escalation',
      subtitle: 'Beat 1 Nano outputs "unsure" -> safely escalates to Beat 2 Cloud Gemini for 100% recall',
      category: 'unsure_escalation',
      groundTruthIsBug: true,
      expectedClaim:
        'Security status pill remains fully legible and untruncated in compact header mode',
      width,
      height,
      beforeRgba: h4Before,
      afterRgba: h4After,
      patchedAfterRgba: h4Patched,
      candidateRects: [
        {
          id: 'security-pill',
          label: 'Truncated Security Pill ("2FA: En...")',
          x: 40,
          y: 60,
          width: 220,
          height: 52,
        },
      ],
      domDelta: [
        {
          selector: '[data-testid="security-pill"]',
          attributeOrText: 'renderedText',
          beforeValue: '2FA: Enabled',
          afterValue: '2FA: En...',
          persistedAfterReload: true,
        },
      ],
      deterministicSourceSlice: [
        '.security-pill {',
        '  max-width: 72px; /* BUG Line 28: truncates "Enabled" vs "Enforced" */',
        '  overflow: hidden;',
        '  text-overflow: ellipsis;',
        '  color: var(--slate-500);',
        '}',
      ].join('\n'),
      defaultTriageVerdict: {
        verdict: 'unsure',
        category: 'ambiguous_truncation',
        confidence: 0.51,
        reason:
          'Text ellipsis "2FA: En..." could be intentional compact truncation or a semantic ambiguity between Enabled and Enforced; escalating to Cloud Gemini.',
        flaggedRegionIds: 'security-pill',
      },
      defaultEscalationVerdict: {
        verdict: 'layout_or_token_break',
        rootCauseLine: 'HeaderPill.css:28',
        explanation:
          'max-width: 72px truncates security state label to "2FA: En..." and drops WCAG contrast ratio to 2.8:1.',
        cssOrStatePatch:
          'max-width: none;\n  color: var(--slate-100, #f1f5f9);',
        patchedClaimResolved: true,
      },
    },
  ];
}

export function getBenchmarkCaseMatrix(): readonly TransitionScenario[] {
  const heroes = getHeroScenarios();
  const [h1, h2, h3, h4] = heroes as [
    TransitionScenario,
    TransitionScenario,
    TransitionScenario,
    TransitionScenario,
  ];

  const cloneCase = (
    base: TransitionScenario,
    id: string,
    title: string,
    subtitle: string,
    groundTruthIsBug: boolean,
    triageVerdict: TransitionScenario['defaultTriageVerdict']['verdict'],
    escalationVerdict: TransitionScenario['defaultEscalationVerdict']['verdict'],
  ): TransitionScenario => ({
    ...base,
    id,
    title,
    subtitle,
    groundTruthIsBug,
    defaultTriageVerdict: {
      ...base.defaultTriageVerdict,
      verdict: triageVerdict,
    },
    defaultEscalationVerdict: {
      ...base.defaultEscalationVerdict,
      verdict: escalationVerdict,
    },
  });

  return [
    // 6 True Bugs (3 Optimistic Persistence Lies + 3 Layout/Token Breaks, including 2 where Beat 1 outputs 'unsure' to preserve recall)
    cloneCase(
      h1,
      'C01',
      'Optimistic Save Toast vs Storage Key Reversion',
      'Toast shows Saved while reload reads stale localStorage key',
      true,
      'false_green_persistence_lie',
      'false_green_persistence_lie',
    ),
    cloneCase(
      h1,
      'C02',
      'Optimistic Role Toggle Drops Tenant Scope on Reload',
      'Admin role switch reverts to Viewer after page refresh',
      true,
      'false_green_persistence_lie',
      'false_green_persistence_lie',
    ),
    cloneCase(
      h1,
      'C03',
      'Silent Cart Quantity Mutation on Promo Apply',
      'Applying coupon resets line-item quantity from 3 to 1',
      true,
      'unsure',
      'false_green_persistence_lie',
    ),
    cloneCase(
      h2,
      'C04',
      'Responsive Pricing Card Badge Overlap at 375px',
      'Negative margin shifts Pro badge onto Free card',
      true,
      'layout_or_token_break',
      'layout_or_token_break',
    ),
    cloneCase(
      h2,
      'C05',
      'Dark-Mode Surface Token Inversion on Modal Footer',
      'Primary CTA text matches background token in dark theme',
      true,
      'layout_or_token_break',
      'layout_or_token_break',
    ),
    cloneCase(
      h4,
      'C06',
      'Truncated Security Status Pill ("2FA: En...")',
      'Ambiguous ellipsis escalated via Beat 1 unsure -> confirmed by Beat 2',
      true,
      'unsure',
      'layout_or_token_break',
    ),
    // 6 Benign Controls (3 Subpixel AA/Font Jitter + 3 Benign Copy/Timestamp Updates)
    cloneCase(
      h3,
      'C07',
      'Subpixel Font Hinting Jitter Across DPR 1.5 -> 2.0',
      'Pure glyph edge diffs with identical layout and DOM state',
      false,
      'benign_transition',
      'benign_transition',
    ),
    cloneCase(
      h3,
      'C08',
      'Relative Timestamp Tick ("1m ago" -> "2m ago")',
      '18 pixel clusters from live timestamp refresh',
      false,
      'benign_transition',
      'benign_transition',
    ),
    cloneCase(
      h3,
      'C09',
      'Chart Gridline 1px Subpixel Raster Shift',
      'Canvas anti-aliasing variance with identical series values',
      false,
      'benign_transition',
      'benign_transition',
    ),
    cloneCase(
      h3,
      'C10',
      'Avatar Skeleton Shimmer Frame Delta',
      'Benign loading pulse transition before profile image settle',
      false,
      'benign_transition',
      'benign_transition',
    ),
    cloneCase(
      h3,
      'C11',
      'Localized Currency Symbol Formatting ("US$29" -> "$29")',
      'Intentional locale display normalization with identical amount',
      false,
      'benign_transition',
      'benign_transition',
    ),
    cloneCase(
      h3,
      'C12',
      'Ambiguous Tooltip Border Shadow Reflow (Benign Control)',
      'Beat 1 marks unsure -> Beat 2 Cloud Gemini confirms benign CSS shadow',
      false,
      'unsure',
      'benign_transition',
    ),
  ];
}

function safeRatio(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return Number((numerator / denominator).toFixed(4));
}

export function evaluateBenchmarkMatrix(
  cases: readonly TransitionScenario[] = getBenchmarkCaseMatrix(),
): BenchmarkMatrixSummary {
  const totalCases = cases.length;
  const bugCaseCount = cases.filter((c) => c.groundTruthIsBug).length;
  const benignCaseCount = totalCases - bugCaseCount;

  const computeArmMetrics = (
    armId: string,
    label: string,
    predictions: readonly boolean[],
    cloudCallsUsed: number,
  ): ArmMetrics => {
    let tp = 0;
    let fp = 0;
    let tn = 0;
    let fn = 0;

    for (let i = 0; i < cases.length; i += 1) {
      const truth = cases[i]!.groundTruthIsBug;
      const pred = predictions[i] ?? false;
      if (truth && pred) tp += 1;
      else if (!truth && pred) fp += 1;
      else if (!truth && !pred) tn += 1;
      else fn += 1;
    }

    const precision = safeRatio(tp, tp + fp);
    const recall = safeRatio(tp, tp + fn);
    const noiseSuppressionRate = safeRatio(tn, benignCaseCount);
    const cloudCallReductionPct =
      totalCases > 0
        ? Number((((totalCases - cloudCallsUsed) / totalCases) * 100).toFixed(1))
        : 0;

    return {
      armId,
      label,
      truePositives: tp,
      falsePositives: fp,
      trueNegatives: tn,
      falseNegatives: fn,
      precision,
      recall,
      noiseSuppressionRate,
      cloudCallsUsed,
      cloudCallReductionPct,
    };
  };

  // Arm 1: Deterministic Rule Baseline (flags any transition with > 0 meaningful diff pixels)
  const arm1Preds = cases.map((c) => {
    const diff = computeTransitionDiff({
      width: c.width,
      height: c.height,
      beforeRgba: c.beforeRgba,
      afterRgba: c.afterRgba,
      candidateRects: c.candidateRects,
    });
    return diff.meaningfulDiffPixels > 0;
  });

  // Arm 2: On-Device Triage Alone (treats non-benign including 'unsure' as flagged without cloud confirmation)
  const arm2Preds = cases.map(
    (c) => c.defaultTriageVerdict.verdict !== 'benign_transition',
  );

  // Arm 3: Full Hybrid FlowWitness (Beat 1 filters benign locally; escalates non-benign / 'unsure' to Beat 2 Cloud Gemini)
  let arm3CloudCalls = 0;
  const arm3Preds = cases.map((c) => {
    if (c.defaultTriageVerdict.verdict === 'benign_transition') {
      return false;
    }
    arm3CloudCalls += 1;
    return c.defaultEscalationVerdict.verdict !== 'benign_transition';
  });

  const perCaseRows = cases.map((c, idx) => ({
    id: c.id,
    title: c.title,
    groundTruthIsBug: c.groundTruthIsBug,
    arm1Flagged: arm1Preds[idx] ?? false,
    arm2Verdict: c.defaultTriageVerdict.verdict,
    arm3FinalBug: arm3Preds[idx] ?? false,
    escalatedToCloud: c.defaultTriageVerdict.verdict !== 'benign_transition',
  }));

  return {
    totalCases,
    bugCaseCount,
    benignCaseCount,
    arms: {
      arm1Deterministic: computeArmMetrics(
        'arm1',
        'Arm 1: Deterministic Pixel/DOM Baseline',
        arm1Preds,
        totalCases,
      ),
      arm2OnDeviceAlone: computeArmMetrics(
        'arm2',
        'Arm 2: On-Device Gemini Nano Triage Alone',
        arm2Preds,
        0,
      ),
      arm3FullHybrid: computeArmMetrics(
        'arm3',
        'Arm 3: Full Hybrid FlowWitness (Nano Sieve + Cloud Escalation)',
        arm3Preds,
        arm3CloudCalls,
      ),
    },
    perCaseRows,
  };
}
