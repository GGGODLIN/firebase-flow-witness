import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  InferenceMode,
  buildHybridModelParams,
  buildObjectSchemaFromFieldMap,
  computeTransitionDiff,
  createTriageVerdictSchema,
  executeHybridInference,
  probeLanguageModelReadiness,
  type BoundingBox,
  type FieldDescriptorMap,
  type HybridInferenceOutcome,
  type HybridRuntimeStats,
  type InferenceModeValue,
  type InferenceReceipt,
  type LanguageModelAvailabilityState,
  type SerializedJsonSchema,
} from '../src/core/flow-witness-engine.ts';

interface IndependentP1Evaluation {
  readonly p1NoOptionalPropertiesKey: boolean;
  readonly p1RequiredMatchesOracle: boolean;
  readonly p1ConstraintMatchesCloudJson: boolean;
}

function evaluateIndependentSchemaOracle(
  fields: FieldDescriptorMap,
  constraint: SerializedJsonSchema,
  cloudSchema: unknown,
): IndependentP1Evaluation {
  const expectedRequired = Object.entries(fields)
    .filter(([, desc]) => desc.optional !== true)
    .map(([key]) => key)
    .sort();

  const actualRequired = [...(constraint.required ?? [])].sort();
  const hasOptionalPropertiesKey =
    'optionalProperties' in constraint &&
    constraint.optionalProperties !== undefined;
  const serializedCloud = JSON.parse(
    JSON.stringify(cloudSchema),
  ) as SerializedJsonSchema;

  const p1NoOptionalPropertiesKey = !hasOptionalPropertiesKey;
  const p1RequiredMatchesOracle =
    actualRequired.length === expectedRequired.length &&
    actualRequired.every((key, idx) => key === expectedRequired[idx]) &&
    Object.keys(constraint.properties ?? {}).length ===
      Object.keys(fields).length;
  const p1ConstraintMatchesCloudJson =
    JSON.stringify(constraint) === JSON.stringify(serializedCloud);

  return {
    p1NoOptionalPropertiesKey,
    p1RequiredMatchesOracle,
    p1ConstraintMatchesCloudJson,
  };
}

interface RoutingOracleInput {
  readonly mode: InferenceModeValue;
  readonly availability: LanguageModelAvailabilityState;
  readonly cloudCutActive: boolean;
  readonly onDeviceThrows: boolean;
  readonly onDeviceMalformedJson: boolean;
}

interface IndependentP2Evaluation {
  readonly p2aConfidentialLeakZero: boolean;
  readonly p2bMutexConcurrencyBounded: boolean;
  readonly p2cReceiptMatchesOracle: boolean;
}

function predictExpectedRoutingOracle(input: RoutingOracleInput): {
  readonly expectedSource: 'on_device' | 'in_cloud' | 'none';
  readonly expectedFallbackTriggered: boolean;
  readonly expectedBlockedConfidential: boolean;
} {
  const canUseOnDevice = input.availability === 'available';
  const onDeviceSucceeds =
    canUseOnDevice && !input.onDeviceThrows && !input.onDeviceMalformedJson;
  const cloudSucceeds = !input.cloudCutActive;

  if (input.mode === InferenceMode.ONLY_ON_DEVICE) {
    if (input.availability === 'missing_global') {
      return {
        expectedSource: 'none',
        expectedFallbackTriggered: false,
        expectedBlockedConfidential: true,
      };
    }
    if (!onDeviceSucceeds) {
      return {
        expectedSource: 'none',
        expectedFallbackTriggered: false,
        expectedBlockedConfidential: false,
      };
    }
    return {
      expectedSource: 'on_device',
      expectedFallbackTriggered: false,
      expectedBlockedConfidential: false,
    };
  }

  if (input.mode === InferenceMode.ONLY_IN_CLOUD) {
    if (cloudSucceeds) {
      return {
        expectedSource: 'in_cloud',
        expectedFallbackTriggered: false,
        expectedBlockedConfidential: false,
      };
    }
    return {
      expectedSource: 'none',
      expectedFallbackTriggered: false,
      expectedBlockedConfidential: false,
    };
  }

  if (input.mode === InferenceMode.PREFER_ON_DEVICE) {
    if (onDeviceSucceeds) {
      return {
        expectedSource: 'on_device',
        expectedFallbackTriggered: false,
        expectedBlockedConfidential: false,
      };
    }
    if (cloudSucceeds) {
      return {
        expectedSource: 'in_cloud',
        expectedFallbackTriggered: true,
        expectedBlockedConfidential: false,
      };
    }
    return {
      expectedSource: 'none',
      expectedFallbackTriggered: true,
      expectedBlockedConfidential: false,
    };
  }

  // PREFER_IN_CLOUD
  if (cloudSucceeds) {
    return {
      expectedSource: 'in_cloud',
      expectedFallbackTriggered: false,
      expectedBlockedConfidential: false,
    };
  }
  if (onDeviceSucceeds) {
    return {
      expectedSource: 'on_device',
      expectedFallbackTriggered: true,
      expectedBlockedConfidential: false,
    };
  }
  return {
    expectedSource: 'none',
    expectedFallbackTriggered: true,
    expectedBlockedConfidential: false,
  };
}

function evaluateIndependentRoutingOracle(
  input: RoutingOracleInput,
  outcome: HybridInferenceOutcome<unknown>,
  maxConcurrentOnDevice: number,
): IndependentP2Evaluation {
  const predicted = predictExpectedRoutingOracle(input);

  const p2aConfidentialLeakZero =
    !(
      input.mode === InferenceMode.ONLY_ON_DEVICE &&
      input.availability === 'missing_global'
    ) ||
    (outcome.receipt.cloudCallsMade === 0 &&
      outcome.receipt.fallbackReason === 'CONFIDENTIAL_MODE_ADAPTER_MISSING' &&
      outcome.status === 'blocked');

  const p2bMutexConcurrencyBounded = maxConcurrentOnDevice <= 1;

  const p2cReceiptMatchesOracle =
    outcome.receipt.actualInferenceSource === predicted.expectedSource &&
    outcome.receipt.fallbackTriggered === predicted.expectedFallbackTriggered;

  return {
    p2aConfidentialLeakZero,
    p2bMutexConcurrencyBounded,
    p2cReceiptMatchesOracle,
  };
}

interface IndependentP3Evaluation {
  readonly p3ClusterCountBounded: boolean;
  readonly p3RegionsWithinCanvasBounds: boolean;
  readonly p3SpriteSingleTileBounded: boolean;
}

function evaluateIndependentSpriteGeometryOracle(
  canvasWidth: number,
  canvasHeight: number,
  regions: readonly BoundingBox[],
  spriteWidth: number,
  spriteHeight: number,
  estimatedTokens: number,
): IndependentP3Evaluation {
  const p3ClusterCountBounded = regions.length <= 6;
  const p3RegionsWithinCanvasBounds = regions.every(
    (box) =>
      box.x >= 0 &&
      box.y >= 0 &&
      box.width > 0 &&
      box.height > 0 &&
      box.x + box.width <= canvasWidth &&
      box.y + box.height <= canvasHeight,
  );
  const p3SpriteSingleTileBounded =
    spriteWidth > 0 &&
    spriteHeight > 0 &&
    spriteWidth <= 384 &&
    spriteHeight <= 384 &&
    (regions.length === 0
      ? estimatedTokens === 0
      : estimatedTokens === 258);

  return {
    p3ClusterCountBounded,
    p3RegionsWithinCanvasBounds,
    p3SpriteSingleTileBounded,
  };
}

function createSolidCanvas(
  width: number,
  height: number,
  rgba: readonly [number, number, number, number],
): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    buf[i * 4] = rgba[0];
    buf[i * 4 + 1] = rgba[1];
    buf[i * 4 + 2] = rgba[2];
    buf[i * 4 + 3] = rgba[3];
  }
  return buf;
}

function paintRect(
  buf: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  rect: { x: number; y: number; width: number; height: number },
  rgba: readonly [number, number, number, number],
): void {
  const xEnd = Math.min(canvasWidth, rect.x + rect.width);
  const yEnd = Math.min(canvasHeight, rect.y + rect.height);
  for (let y = Math.max(0, rect.y); y < yEnd; y += 1) {
    for (let x = Math.max(0, rect.x); x < xEnd; x += 1) {
      const idx = (y * canvasWidth + x) * 4;
      buf[idx] = rgba[0];
      buf[idx + 1] = rgba[1];
      buf[idx + 2] = rgba[2];
      buf[idx + 3] = rgba[3];
    }
  }
}

describe('Ticket 01 — FlowWitness HybridInferenceGateway & Beat 0 Diff Engine', () => {
  describe('Role 1: Concrete Capability Examples (Ticket 01 Acceptance Batch)', () => {
    it('[Criterion 1] buildHybridModelParams() compiles a single Schema.object() into inCloudParams and onDeviceParams with .toJSON() stripping optionalProperties', () => {
      const triageSchema = createTriageVerdictSchema();
      expect(triageSchema).toBeDefined();

      const params = buildHybridModelParams({
        mode: InferenceMode.PREFER_ON_DEVICE,
        schema: triageSchema,
        systemInstruction: 'Classify UI transition diffs strictly.',
      });

      expect(params.mode).toBe(InferenceMode.PREFER_ON_DEVICE);
      expect(params.inCloudParams.systemInstruction).toBe(
        'Classify UI transition diffs strictly.',
      );
      expect(params.inCloudParams.generationConfig.responseMimeType).toBe(
        'application/json',
      );
      expect(params.inCloudParams.generationConfig.responseSchema).toBe(
        triageSchema,
      );

      expect(
        params.onDeviceParams.createOptions.initialPrompts[0]?.content[0]?.value,
      ).toBe('Classify UI transition diffs strictly.');
      expect(
        params.onDeviceParams.promptOptions.omitResponseConstraintInput,
      ).toBe(true);

      const constraint = params.onDeviceParams.promptOptions.responseConstraint;
      expect('optionalProperties' in constraint).toBe(false);
      expect(constraint.required).toEqual(
        expect.arrayContaining(['verdict', 'category', 'confidence', 'reason']),
      );
      expect(constraint.required).not.toContain('flaggedRegionIds');
    });

    it('[Criterion 2] executeHybridInference() blocks ONLY_ON_DEVICE with CONFIDENTIAL_MODE_ADAPTER_MISSING and 0 cloud calls when window.LanguageModel is missing', async () => {
      const stats: HybridRuntimeStats = {
        cloudCallCount: 0,
        onDeviceCallCount: 0,
        activeConcurrentOnDevice: 0,
        maxConcurrentOnDevice: 0,
      };
      const receiptLedger: InferenceReceipt[] = [];

      const positiveControl = await executeHybridInference(
        {
          runId: 1,
          stepId: 'beat1-positive-control',
          mode: InferenceMode.PREFER_ON_DEVICE,
          promptText: 'Check positive cloud fallback when LanguageModel missing',
          schema: createTriageVerdictSchema(),
          systemInstruction: 'Triage transition.',
          fallbackValue: { verdict: 'unsure' },
        },
        {
          languageModelAvailability: 'missing_global',
          stats,
          receiptLedger,
          invokeInCloud: async () => {
            stats.cloudCallCount += 1;
            return JSON.stringify({
              verdict: 'benign_transition',
              category: 'aa_jitter',
              confidence: 0.96,
              reason: 'Minor font AA only',
            });
          },
        },
      );
      expect(positiveControl.receipt.cloudCallsMade).toBe(1);
      expect(stats.cloudCallCount).toBe(1);

      const statsConfidential: HybridRuntimeStats = {
        cloudCallCount: 0,
        onDeviceCallCount: 0,
        activeConcurrentOnDevice: 0,
        maxConcurrentOnDevice: 0,
      };

      const outcome = await executeHybridInference(
        {
          runId: 2,
          stepId: 'beat1-confidential',
          mode: InferenceMode.ONLY_ON_DEVICE,
          promptText: 'Confidential unreleased UI snapshot',
          schema: createTriageVerdictSchema(),
          systemInstruction: 'Triage transition.',
          fallbackValue: { verdict: 'unsure' },
        },
        {
          languageModelAvailability: 'missing_global',
          stats: statsConfidential,
          receiptLedger,
          invokeInCloud: async () => {
            statsConfidential.cloudCallCount += 1;
            return JSON.stringify({ verdict: 'benign_transition' });
          },
        },
      );

      expect(outcome.status).toBe('blocked');
      expect(statsConfidential.cloudCallCount).toBe(0);
      expect(outcome.receipt.cloudCallsMade).toBe(0);
      expect(outcome.receipt.actualInferenceSource).toBe('none');
      expect(outcome.receipt.fallbackReason).toBe(
        'CONFIDENTIAL_MODE_ADAPTER_MISSING',
      );
    });

    it('[Criterion 3] executeHybridInference() serializes concurrent on-device calls through a concurrency-1 FIFO mutex', async () => {
      const stats: HybridRuntimeStats = {
        cloudCallCount: 0,
        onDeviceCallCount: 0,
        activeConcurrentOnDevice: 0,
        maxConcurrentOnDevice: 0,
      };
      const executionOrder: string[] = [];

      const makeCall = (stepId: string, delayMs: number) =>
        executeHybridInference(
          {
            runId: 10,
            stepId,
            mode: InferenceMode.PREFER_ON_DEVICE,
            promptText: `Prompt ${stepId}`,
            schema: createTriageVerdictSchema(),
            systemInstruction: 'Triage.',
            fallbackValue: { verdict: 'unsure' },
          },
          {
            languageModelAvailability: 'available',
            stats,
            invokeOnDevice: async () => {
              executionOrder.push(`start:${stepId}`);
              await new Promise((resolve) => setTimeout(resolve, delayMs));
              executionOrder.push(`end:${stepId}`);
              return JSON.stringify({
                verdict: 'benign_transition',
                category: 'copy',
                confidence: 0.92,
                reason: 'Ordered execution',
              });
            },
          },
        );

      const results = await Promise.all([
        makeCall('call-1', 25),
        makeCall('call-2', 10),
        makeCall('call-3', 5),
      ]);

      expect(stats.maxConcurrentOnDevice).toBe(1);
      expect(results[2]?.receipt.maxConcurrentOnDeviceObserved).toBe(1);
      expect(executionOrder).toEqual([
        'start:call-1',
        'end:call-1',
        'start:call-2',
        'end:call-2',
        'start:call-3',
        'end:call-3',
      ]);
    });

    it('[Criterion 4] executeHybridInference() passes SingleRequestOptions.baseUrl under cloudCutActive and falls back to on_device on PREFER_IN_CLOUD', async () => {
      const stats: HybridRuntimeStats = {
        cloudCallCount: 0,
        onDeviceCallCount: 0,
        activeConcurrentOnDevice: 0,
        maxConcurrentOnDevice: 0,
      };
      const originalFetch = globalThis.fetch;

      const outcome = await executeHybridInference(
        {
          runId: 20,
          stepId: 'beat2-cloud-cut',
          mode: InferenceMode.PREFER_IN_CLOUD,
          promptText: 'Escalated pre-sliced source + composite sprite',
          schema: buildObjectSchemaFromFieldMap({
            verdict: { type: 'string', optional: false },
            rootCauseLine: { type: 'string', optional: false },
            explanation: { type: 'string', optional: false },
            cssOrStatePatch: { type: 'string', optional: false },
            patchedClaimResolved: { type: 'boolean', optional: false },
          }),
          systemInstruction: 'Diagnose root cause.',
          cloudCutActive: true,
          fallbackValue: {
            verdict: 'layout_or_token_break',
            rootCauseLine: 'unknown',
            explanation: 'fallback',
            cssOrStatePatch: '',
            patchedClaimResolved: false,
          },
        },
        {
          languageModelAvailability: 'available',
          stats,
          invokeInCloud: async ({ singleRequestOptions }) => {
            stats.lastSingleRequestOptions = singleRequestOptions;
            throw new Error(
              `AIError: Error fetching from ${singleRequestOptions?.baseUrl ?? 'unknown'} (FETCH_ERROR)`,
            );
          },
          invokeOnDevice: async () =>
            JSON.stringify({
              verdict: 'layout_or_token_break',
              rootCauseLine: 'PricingCard.tsx:42',
              explanation: 'Hardcoded padding causes badge overlap at 375px',
              cssOrStatePatch: 'padding-top: var(--space-6);',
              patchedClaimResolved: true,
            }),
        },
      );

      expect(globalThis.fetch).toBe(originalFetch);
      expect(stats.lastSingleRequestOptions?.baseUrl).toBe(
        'https://fault-injection.invalid',
      );
      expect(outcome.receipt.singleRequestOptionsPassed?.baseUrl).toBe(
        'https://fault-injection.invalid',
      );
      expect(outcome.receipt.actualInferenceSource).toBe('on_device');
      expect(outcome.receipt.fallbackTriggered).toBe(true);
      expect(outcome.receipt.fallbackReason).toBe('CLOUD_FETCH_ERROR_FALLBACK');
      expect(outcome.data).toEqual(
        expect.objectContaining({
          verdict: 'layout_or_token_break',
          rootCauseLine: 'PricingCard.tsx:42',
          patchedClaimResolved: true,
        }),
      );
    });

    it('[Criterion 5] executeHybridInference() catches malformed/truncated on-device JSON and records ON_DEVICE_SCHEMA_PARSE_FAILURE cleanly', async () => {
      const outcome = await executeHybridInference(
        {
          runId: 30,
          stepId: 'beat1-truncated-json',
          mode: InferenceMode.PREFER_ON_DEVICE,
          promptText: 'Inspect noisy transition',
          schema: createTriageVerdictSchema(),
          systemInstruction: 'Triage.',
          cloudCutActive: true,
          fallbackValue: {
            verdict: 'unsure',
            category: 'parse_fallback',
            confidence: 0,
            reason: 'Escalated due to truncated on-device JSON',
          },
        },
        {
          languageModelAvailability: 'available',
          invokeOnDevice: async () => '{"verdict": "false_green_persistence_lie", "reason": "trunc',
          invokeInCloud: async () => {
            throw new Error('FETCH_ERROR');
          },
        },
      );

      expect(outcome.status).toBe('degraded');
      expect(outcome.receipt.schemaValid).toBe(false);
      expect(outcome.receipt.fallbackReason).toBe(
        'ON_DEVICE_SCHEMA_PARSE_FAILURE',
      );
      expect(outcome.data).toEqual(
        expect.objectContaining({
          verdict: 'unsure',
          category: 'parse_fallback',
        }),
      );
    });

    it('[Criterion 6] computeTransitionDiff() strips pure anti-aliasing pixels via includeAA:false and clamps composite sprite to <= 384x384 px', () => {
      const width = 420;
      const height = 300;
      const before = createSolidCanvas(width, height, [248, 250, 252, 255]);
      const after = createSolidCanvas(width, height, [248, 250, 252, 255]);

      paintRect(
        after,
        width,
        height,
        { x: 24, y: 30, width: 90, height: 36 },
        [220, 38, 38, 255],
      );
      paintRect(
        after,
        width,
        height,
        { x: 260, y: 180, width: 110, height: 48 },
        [37, 99, 235, 255],
      );

      const diff = computeTransitionDiff({
        width,
        height,
        beforeRgba: before,
        afterRgba: after,
        candidateRects: [
          { id: 'toast-banner', x: 20, y: 25, width: 100, height: 45 },
          { id: 'save-button', x: 255, y: 175, width: 120, height: 55 },
        ],
      });

      expect(diff.meaningfulDiffPixels).toBe(90 * 36 + 110 * 48);
      expect(diff.clusteredRegions.length).toBe(2);
      expect(diff.spriteWidth).toBeLessThanOrEqual(384);
      expect(diff.spriteHeight).toBeLessThanOrEqual(384);
      expect(diff.estimatedImageTokens).toBe(258);
    });

    it('probeLanguageModelReadiness() passively checks text and multimodal availability without calling create()', async () => {
      let createCalled = false;
      const readiness = await probeLanguageModelReadiness({
        LanguageModel: {
          availability: async (opts?: {
            expectedInputs?: ReadonlyArray<{ type: string }>;
          }) => {
            const hasImage = opts?.expectedInputs?.some(
              (input) => input.type === 'image',
            );
            return hasImage ? 'downloadable' : 'available';
          },
          create: async () => {
            createCalled = true;
            return {};
          },
        },
      });

      expect(createCalled).toBe(false);
      expect(readiness.textAvailability).toBe('available');
      expect(readiness.multimodalAvailability).toBe('downloadable');
      expect(readiness.canRunOnDeviceText).toBe(true);
      expect(readiness.canRunOnDeviceMultimodal).toBe(false);
    });
  });

  describe('Role 2: Safety Property Guardians (P1..P3 via fast-check)', () => {
    it('P1: Dual-Target Schema Compilation Round-Trip & Required-Field Conservation', () => {
      const fieldDescArb = fc.record({
        type: fc.constantFrom(
          'string' as const,
          'number' as const,
          'boolean' as const,
          'enumString' as const,
        ),
        optional: fc.boolean(),
        enumValues: fc.constant(['alpha', 'beta', 'gamma'] as const),
      });

      const fieldMapArb = fc.dictionary(
        fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{1,12}$/),
        fieldDescArb,
        { minKeys: 1, maxKeys: 8 },
      );

      let optionalSeenCount = 0;
      let requiredSeenCount = 0;

      fc.assert(
        fc.property(fieldMapArb, (fieldMap) => {
          const schema = buildObjectSchemaFromFieldMap(fieldMap);
          const compiled = buildHybridModelParams({
            mode: InferenceMode.PREFER_ON_DEVICE,
            schema,
            systemInstruction: 'Verify P1 invariant.',
          });

          const constraint =
            compiled.onDeviceParams.promptOptions.responseConstraint;
          const oracle = evaluateIndependentSchemaOracle(
            fieldMap,
            constraint,
            compiled.inCloudParams.generationConfig.responseSchema,
          );

          if (Object.values(fieldMap).some((f) => f.optional)) {
            optionalSeenCount += 1;
          }
          if (Object.values(fieldMap).some((f) => !f.optional)) {
            requiredSeenCount += 1;
          }

          if (
            !oracle.p1NoOptionalPropertiesKey ||
            !oracle.p1RequiredMatchesOracle ||
            !oracle.p1ConstraintMatchesCloudJson
          ) {
            return false;
          }
          return true;
        }),
        { numRuns: 80 },
      );

      expect(optionalSeenCount).toBeGreaterThan(0);
      expect(requiredSeenCount).toBeGreaterThan(0);
    });

    it('P2: Hybrid Routing Safety, Confidential Leak-Zero, & Concurrency-1 Mutex Invariant', async () => {
      const stepArb = fc.record({
        mode: fc.constantFrom(
          InferenceMode.PREFER_ON_DEVICE,
          InferenceMode.ONLY_ON_DEVICE,
          InferenceMode.PREFER_IN_CLOUD,
          InferenceMode.ONLY_IN_CLOUD,
        ),
        availability: fc.constantFrom<LanguageModelAvailabilityState>(
          'missing_global',
          'unavailable',
          'downloadable',
          'available',
        ),
        cloudCutActive: fc.boolean(),
        onDeviceThrows: fc.boolean(),
        onDeviceMalformedJson: fc.boolean(),
      });

      let confidentialBlockedWitnessCount = 0;
      let cloudCutFallbackWitnessCount = 0;

      await fc.assert(
        fc.asyncProperty(
          fc.array(stepArb, { minLength: 1, maxLength: 8 }),
          async (steps) => {
            const schema = createTriageVerdictSchema();

            for (let idx = 0; idx < steps.length; idx += 1) {
              const step = steps[idx]!;
              const stats: HybridRuntimeStats = {
                cloudCallCount: 0,
                onDeviceCallCount: 0,
                activeConcurrentOnDevice: 0,
                maxConcurrentOnDevice: 0,
              };

              const outcome = await executeHybridInference(
                {
                  runId: idx + 1,
                  stepId: `step-${idx}`,
                  mode: step.mode,
                  promptText: 'Evaluate hybrid routing safety',
                  schema,
                  systemInstruction: 'Triage.',
                  cloudCutActive: step.cloudCutActive,
                  fallbackValue: { verdict: 'unsure' },
                },
                {
                  languageModelAvailability: step.availability,
                  stats,
                  invokeOnDevice: async () => {
                    if (step.onDeviceThrows) {
                      throw new Error('DOMException: Session destroyed');
                    }
                    if (step.onDeviceMalformedJson) {
                      return '{"verdict": "broken_json';
                    }
                    return JSON.stringify({
                      verdict: 'benign_transition',
                      category: 'aa',
                      confidence: 0.9,
                      reason: 'ok',
                    });
                  },
                  invokeInCloud: async () => {
                    if (step.cloudCutActive) {
                      throw new Error('AIError: FETCH_ERROR');
                    }
                    return JSON.stringify({
                      verdict: 'false_green_persistence_lie',
                      category: 'state_reversion',
                      confidence: 0.95,
                      reason: 'cloud ok',
                    });
                  },
                },
              );

              if (
                step.mode === InferenceMode.ONLY_ON_DEVICE &&
                step.availability === 'missing_global'
              ) {
                confidentialBlockedWitnessCount += 1;
              }
              if (
                step.mode === InferenceMode.PREFER_IN_CLOUD &&
                step.cloudCutActive &&
                step.availability === 'available' &&
                !step.onDeviceThrows &&
                !step.onDeviceMalformedJson
              ) {
                cloudCutFallbackWitnessCount += 1;
              }

              const oracle = evaluateIndependentRoutingOracle(
                step,
                outcome,
                stats.maxConcurrentOnDevice,
              );

              if (
                !oracle.p2aConfidentialLeakZero ||
                !oracle.p2bMutexConcurrencyBounded ||
                !oracle.p2cReceiptMatchesOracle
              ) {
                return false;
              }
            }
            return true;
          },
        ),
        { numRuns: 60 },
      );

      expect(confidentialBlockedWitnessCount).toBeGreaterThan(0);
      expect(cloudCutFallbackWitnessCount).toBeGreaterThan(0);
    });

    it('P3: Composite Sprite Bounding & Single-Tile Token Conservation Invariant', () => {
      const mutationRectArb = fc.record({
        xRatio: fc.double({ min: 0, max: 0.9, noNaN: true }),
        yRatio: fc.double({ min: 0, max: 0.9, noNaN: true }),
        wPx: fc.integer({ min: 4, max: 60 }),
        hPx: fc.integer({ min: 4, max: 60 }),
      });

      const canvasSpecArb = fc.record({
        width: fc.integer({ min: 120, max: 320 }),
        height: fc.integer({ min: 120, max: 240 }),
        mutations: fc.array(mutationRectArb, { minLength: 0, maxLength: 10 }),
      });

      let multiRegionWitnessCount = 0;

      fc.assert(
        fc.property(canvasSpecArb, (spec) => {
          const before = createSolidCanvas(
            spec.width,
            spec.height,
            [240, 242, 245, 255],
          );
          const after = createSolidCanvas(
            spec.width,
            spec.height,
            [240, 242, 245, 255],
          );

          for (const m of spec.mutations) {
            const x = Math.floor(m.xRatio * (spec.width - 4));
            const y = Math.floor(m.yRatio * (spec.height - 4));
            paintRect(
              after,
              spec.width,
              spec.height,
              { x, y, width: m.wPx, height: m.hPx },
              [220, 30, 30, 255],
            );
          }

          const diff = computeTransitionDiff({
            width: spec.width,
            height: spec.height,
            beforeRgba: before,
            afterRgba: after,
          });

          if (diff.clusteredRegions.length > 1) {
            multiRegionWitnessCount += 1;
          }

          const oracle = evaluateIndependentSpriteGeometryOracle(
            spec.width,
            spec.height,
            diff.clusteredRegions,
            diff.spriteWidth,
            diff.spriteHeight,
            diff.estimatedImageTokens,
          );

          if (
            !oracle.p3ClusterCountBounded ||
            !oracle.p3RegionsWithinCanvasBounds ||
            !oracle.p3SpriteSingleTileBounded
          ) {
            return false;
          }
          return true;
        }),
        { numRuns: 45 },
      );

      expect(multiRegionWitnessCount).toBeGreaterThan(0);
    });
  });

  describe('Role 3: Oracle Calibration & Counterexample Replay (Negative Controls)', () => {
    it('Calibrates P1 Oracle: detects unserialized optionalProperties and mismatched required array individually', () => {
      const fields: FieldDescriptorMap = {
        verdict: { type: 'string', optional: false },
        notes: { type: 'string', optional: true },
      };

      const badOptionalProps = evaluateIndependentSchemaOracle(
        fields,
        {
          type: 'object',
          properties: { verdict: { type: 'string' }, notes: { type: 'string' } },
          required: ['verdict'],
          optionalProperties: ['notes'],
        },
        {
          type: 'object',
          properties: { verdict: { type: 'string' }, notes: { type: 'string' } },
          required: ['verdict'],
        },
      );
      expect(badOptionalProps.p1NoOptionalPropertiesKey).toBe(false);
      expect(badOptionalProps.p1RequiredMatchesOracle).toBe(true);

      const badRequired = evaluateIndependentSchemaOracle(
        fields,
        {
          type: 'object',
          properties: { verdict: { type: 'string' }, notes: { type: 'string' } },
          required: ['verdict', 'notes'],
        },
        {
          type: 'object',
          properties: { verdict: { type: 'string' }, notes: { type: 'string' } },
          required: ['verdict', 'notes'],
        },
      );
      expect(badRequired.p1NoOptionalPropertiesKey).toBe(true);
      expect(badRequired.p1RequiredMatchesOracle).toBe(false);
    });

    it('Calibrates P2 Oracle: detects ONLY_ON_DEVICE cloud leak, concurrency > 1, and dishonest inferenceSource individually', () => {
      const baseReceipt = {
        receiptId: 'r-cal',
        runId: 1,
        stepId: 's1',
        requestedMode: InferenceMode.ONLY_ON_DEVICE,
        actualInferenceSource: 'none' as const,
        fallbackTriggered: false,
        fallbackReason: 'CONFIDENTIAL_MODE_ADAPTER_MISSING' as const,
        schemaValid: true,
        latencyMs: 1,
        appCheckHeaderPresent: true,
        cloudCallsMade: 0,
        onDeviceCallsMade: 0,
        maxConcurrentOnDeviceObserved: 1,
        timestampIso: '2026-11-09T00:00:00.000Z',
      };

      const leakedConfidential = evaluateIndependentRoutingOracle(
        {
          mode: InferenceMode.ONLY_ON_DEVICE,
          availability: 'missing_global',
          cloudCutActive: false,
          onDeviceThrows: false,
          onDeviceMalformedJson: false,
        },
        {
          status: 'ok',
          data: {},
          receipt: {
            ...baseReceipt,
            actualInferenceSource: 'in_cloud',
            cloudCallsMade: 1,
            fallbackReason: 'NONE',
          },
        },
        1,
      );
      expect(leakedConfidential.p2aConfidentialLeakZero).toBe(false);
      expect(leakedConfidential.p2bMutexConcurrencyBounded).toBe(true);

      const concurrencyViolation = evaluateIndependentRoutingOracle(
        {
          mode: InferenceMode.PREFER_ON_DEVICE,
          availability: 'available',
          cloudCutActive: false,
          onDeviceThrows: false,
          onDeviceMalformedJson: false,
        },
        {
          status: 'ok',
          data: {},
          receipt: {
            ...baseReceipt,
            requestedMode: InferenceMode.PREFER_ON_DEVICE,
            actualInferenceSource: 'on_device',
            fallbackReason: 'NONE',
          },
        },
        2,
      );
      expect(concurrencyViolation.p2aConfidentialLeakZero).toBe(true);
      expect(concurrencyViolation.p2bMutexConcurrencyBounded).toBe(false);
      expect(concurrencyViolation.p2cReceiptMatchesOracle).toBe(true);
    });

    it('Calibrates P3 Oracle: detects >6 clusters, out-of-bounds boxes, and >384px sprite individually', () => {
      const sevenClusters = Array.from({ length: 7 }, (_, i) => ({
        id: `r-${i}`,
        x: i * 10,
        y: 0,
        width: 8,
        height: 8,
      }));
      const evalClusters = evaluateIndependentSpriteGeometryOracle(
        200,
        200,
        sevenClusters,
        384,
        384,
        258,
      );
      expect(evalClusters.p3ClusterCountBounded).toBe(false);
      expect(evalClusters.p3RegionsWithinCanvasBounds).toBe(true);
      expect(evalClusters.p3SpriteSingleTileBounded).toBe(true);

      const outOfBounds = evaluateIndependentSpriteGeometryOracle(
        200,
        200,
        [{ id: 'oob', x: 180, y: 10, width: 30, height: 20 }],
        384,
        384,
        258,
      );
      expect(outOfBounds.p3ClusterCountBounded).toBe(true);
      expect(outOfBounds.p3RegionsWithinCanvasBounds).toBe(false);

      const oversizedSprite = evaluateIndependentSpriteGeometryOracle(
        200,
        200,
        [{ id: 'ok', x: 10, y: 10, width: 20, height: 20 }],
        512,
        384,
        258,
      );
      expect(oversizedSprite.p3SpriteSingleTileBounded).toBe(false);
    });
  });
});
