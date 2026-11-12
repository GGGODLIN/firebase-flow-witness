import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InferenceMode, createTriageVerdictSchema, executeHybridInference } from '../src/core/flow-witness-engine.ts';

const external = vi.hoisted(() => ({
  initialize: vi.fn(), token: vi.fn(), model: vi.fn(), generate: vi.fn(), events: [] as string[],
}));
vi.mock('firebase/app-check', () => ({
  initializeAppCheck: (...args: unknown[]) => { external.events.push('app-check'); return external.initialize(...args); },
  getToken: (...args: unknown[]) => external.token(...args),
  CustomProvider: class { constructor(readonly options: unknown) {} },
  ReCaptchaEnterpriseProvider: class { constructor(readonly key: string) {} },
}));
vi.mock('firebase/ai', async (original) => ({
  ...await original<typeof import('firebase/ai')>(),
  getAI: () => { external.events.push('ai'); return {}; },
  getGenerativeModel: (...args: unknown[]) => { external.model(...args); return { generateContent: external.generate }; },
}));

const config = { apiKey: 'synthetic-test-key', projectId: 'demo-test', appId: '1:123:web:test' };
const verdict = { verdict: 'benign_transition', category: 'control', confidence: 1, reason: 'Intentional update' };

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubGlobal('location', { hostname: 'localhost' });
  vi.stubGlobal('FIREBASE_APPCHECK_DEBUG_TOKEN', undefined);
  vi.stubGlobal('LanguageModel', { availability: async () => 'available' });
  vi.stubGlobal('window', { LanguageModel: { availability: async () => 'available' } });
  external.events.length = 0;
  external.initialize.mockReturnValue({});
  external.token.mockResolvedValue({ token: 'synthetic-attestation' });
  external.generate.mockResolvedValue({ response: { text: () => JSON.stringify(verdict), inferenceSource: 'on_device' } });
});

describe('Firebase SDK and mandatory App Check boundary', () => {
  it('also blocks a direct ONLY_ON_DEVICE invocation without the browser model', async () => {
    const { invokeFirebaseHybrid } = await import('../src/lib/firebase-cloud.ts');
    const input = { config: { ...config, recaptchaSiteKey: 'synthetic-site' }, mode: InferenceMode.ONLY_ON_DEVICE, inCloudParams: {}, promptText: 'private', sprite: null };
    vi.stubGlobal('window', {});
    await expect(invokeFirebaseHybrid(input)).rejects.toThrow('LanguageModel is missing');
    expect(external.model).toHaveBeenCalledTimes(0);
    vi.stubGlobal('window', { LanguageModel: {} });
    expect((await invokeFirebaseHybrid(input)).source).toBe('on_device');
    expect(external.model).toHaveBeenCalledTimes(1);
  });

  it('fails closed without App Check config and sends no inference', async () => {
    const { invokeFirebaseHybrid } = await import('../src/lib/firebase-cloud.ts');
    await expect(invokeFirebaseHybrid({ config, inCloudParams: { model: 'gemini-3.5-flash-lite' }, promptText: 'secret screenshot', sprite: null })).rejects.toThrow('App Check required');
    expect(external.model).toHaveBeenCalledTimes(0);
    await invokeFirebaseHybrid({ config: { ...config, recaptchaSiteKey: 'synthetic-site' }, inCloudParams: {}, promptText: 'control', sprite: null });
    expect(external.model).toHaveBeenCalledTimes(1);
    expect(external.events).toEqual(['app-check', 'ai']);
  });

  it('sets the debug flag before initialization and accepts an exchanged token', async () => {
    external.initialize.mockImplementation(() => {
      expect((globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN).toBe('synthetic-debug');
      return {};
    });
    vi.stubGlobal('FIREBASE_APPCHECK_DEBUG_TOKEN', 'synthetic-debug');
    const { invokeFirebaseHybrid } = await import('../src/lib/firebase-cloud.ts');
    const result = await invokeFirebaseHybrid({ config, mode: InferenceMode.PREFER_IN_CLOUD, inCloudParams: {}, promptText: 'control', sprite: null });
    expect(result).toEqual({ text: JSON.stringify(verdict), source: 'on_device' });
    expect(external.token).toHaveBeenCalledTimes(1);
    expect(external.events).toEqual(['app-check', 'ai']);
  });

  it('production and site-key setups ignore a pre-existing runtime debug token', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubGlobal('FIREBASE_APPCHECK_DEBUG_TOKEN', 'synthetic-debug');
    external.initialize.mockImplementation((_app, options) => {
      expect(options.provider.key).toBe('synthetic-site');
      expect((globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: unknown }).FIREBASE_APPCHECK_DEBUG_TOKEN).toBeUndefined();
      return {};
    });
    const { invokeFirebaseHybrid } = await import('../src/lib/firebase-cloud.ts');
    await invokeFirebaseHybrid({ config: { ...config, recaptchaSiteKey: 'synthetic-site' }, inCloudParams: {}, promptText: 'control', sprite: null });
    expect(external.generate).toHaveBeenCalledTimes(1);
  });

  it('PREFER_ON_DEVICE still runs locally when token acquisition is offline', async () => {
    external.token.mockRejectedValue(new Error('offline token exchange'));
    const { invokeFirebaseHybrid } = await import('../src/lib/firebase-cloud.ts');
    const input = { config: { ...config, recaptchaSiteKey: 'synthetic-site' }, mode: InferenceMode.PREFER_ON_DEVICE, inCloudParams: {}, promptText: 'control', sprite: null };
    expect((await invokeFirebaseHybrid(input)).source).toBe('on_device');
    expect(external.token).toHaveBeenCalledTimes(0);
    vi.stubGlobal('LanguageModel', { availability: async () => 'unavailable' });
    await expect(invokeFirebaseHybrid(input)).rejects.toThrow('offline');
    expect(external.token).toHaveBeenCalledTimes(1);
  });

  it('does not generate if App Check token exchange fails', async () => {
    const { invokeFirebaseHybrid } = await import('../src/lib/firebase-cloud.ts');
    external.token.mockRejectedValueOnce(new Error('unregistered debug token'));
    const input = { config: { ...config, recaptchaSiteKey: 'synthetic-site' }, inCloudParams: {}, promptText: 'control', sprite: null };
    await expect(invokeFirebaseHybrid(input)).rejects.toThrow('unregistered');
    expect(external.generate).toHaveBeenCalledTimes(0);
    await invokeFirebaseHybrid(input);
    expect(external.generate).toHaveBeenCalledTimes(1);
  });

  it.each(Object.values(InferenceMode))('passes %s through official getGenerativeModel and preserves SDK attribution', async (mode) => {
    const { createBrowserHybridRuntime } = await import('../src/lib/hybrid-runtime.ts');
    const source = mode === InferenceMode.ONLY_IN_CLOUD || mode === InferenceMode.PREFER_IN_CLOUD ? 'in_cloud' : 'on_device';
    external.generate.mockResolvedValue({ response: { text: () => JSON.stringify(verdict), inferenceSource: source } });
    const runtime = createBrowserHybridRuntime({ availability: 'available', sprite: null,
      contract: { mode, schema: createTriageVerdictSchema(), systemInstruction: 'narrow judge' },
      cloud: { ...config, recaptchaSiteKey: 'synthetic-site' },
    });
    const outcome = await executeHybridInference({ runId: 1, stepId: 'sdk', mode, schema: createTriageVerdictSchema(), systemInstruction: 'narrow judge', promptText: 'control', fallbackValue: verdict }, runtime);
    expect(outcome.status).toBe('ok');
    expect(outcome.receipt.actualInferenceSource).toBe(source);
    expect(external.model.mock.calls[0]?.[1]).toMatchObject({ mode: mode === InferenceMode.PREFER_ON_DEVICE ? InferenceMode.ONLY_ON_DEVICE : mode, onDeviceParams: { promptOptions: { omitResponseConstraintInput: true } } });
    expect(external.events).toEqual(['app-check', 'ai']);
  });

  it('blocks invalid local JSON and reports local exceptions without cloud attribution', async () => {
    const request = { runId: 2, stepId: 'invalid-local', mode: InferenceMode.ONLY_ON_DEVICE, schema: createTriageVerdictSchema(), systemInstruction: '', promptText: 'private', fallbackValue: verdict };
    const malformed = await executeHybridInference(request, { languageModelAvailability: 'available', invokeHybrid: async () => ({ text: '{invalid', source: 'on_device' }) });
    expect(malformed.status).toBe('blocked');
    expect(malformed.receipt).toMatchObject({ fallbackReason: 'ON_DEVICE_SCHEMA_PARSE_FAILURE', cloudCallsMade: 0 });
    const thrown = await executeHybridInference(request, { languageModelAvailability: 'available', invokeHybrid: async ({ onAttempt }) => { onAttempt?.('on_device'); throw new Error('local model failed'); } });
    expect(thrown.status).toBe('blocked');
    expect(thrown.receipt).toMatchObject({ fallbackReason: 'ON_DEVICE_PROMPT_EXCEPTION', cloudCallsMade: 0, onDeviceCallsMade: 1 });
  });

  it('counts a cloud attempt that fails after generation starts but not failed attestation', async () => {
    const { createBrowserHybridRuntime } = await import('../src/lib/hybrid-runtime.ts');
    const mode = InferenceMode.ONLY_IN_CLOUD;
    const runtime = () => createBrowserHybridRuntime({ availability: 'missing_global', sprite: null, contract: { mode, schema: createTriageVerdictSchema(), systemInstruction: '' }, cloud: { ...config, recaptchaSiteKey: 'synthetic-site' } });
    const request = { runId: 3, stepId: 'cloud-error', mode, schema: createTriageVerdictSchema(), systemInstruction: '', promptText: 'control', fallbackValue: verdict };
    external.token.mockRejectedValueOnce(new Error('attestation failed'));
    expect((await executeHybridInference(request, runtime())).receipt.cloudCallsMade).toBe(0);
    external.generate.mockRejectedValue(new Error('cloud fetch failed'));
    const failed = await executeHybridInference(request, runtime());
    expect(failed.receipt).toMatchObject({ cloudCallsMade: 1, fallbackReason: 'CLOUD_FETCH_ERROR_TERMINAL' });
  });

  it('blocks ONLY_ON_DEVICE before SDK initialization when LanguageModel is missing', async () => {
    const { createBrowserHybridRuntime } = await import('../src/lib/hybrid-runtime.ts');
    const mode = InferenceMode.ONLY_ON_DEVICE;
    const create = (availability: 'missing_global' | 'available') => createBrowserHybridRuntime({ availability, sprite: null, contract: { mode, schema: createTriageVerdictSchema(), systemInstruction: '' }, cloud: { ...config, recaptchaSiteKey: 'synthetic-site' } });
    const request = { runId: 1, stepId: 'private', mode, schema: createTriageVerdictSchema(), systemInstruction: '', promptText: 'private', fallbackValue: verdict };
    const blocked = await executeHybridInference(request, create('missing_global'));
    expect(blocked.receipt).toMatchObject({ actualInferenceSource: 'none', cloudCallsMade: 0, fallbackReason: 'CONFIDENTIAL_MODE_ADAPTER_MISSING' });
    expect(external.model).toHaveBeenCalledTimes(0);
    expect((await executeHybridInference(request, create('available'))).receipt.actualInferenceSource).toBe('on_device');
    expect(external.model).toHaveBeenCalledTimes(1);
  });
});
