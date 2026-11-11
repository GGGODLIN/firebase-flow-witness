import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp } from 'firebase/app';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const payload = { verdict: 'benign_transition', category: 'sdk', confidence: 1, reason: 'SDK adapter integration' };

afterEach(() => { vi.unstubAllGlobals(); });

describe('real firebase/ai SDK on-device integration', () => {
  it('uses native SDK fallback after a cloud fetch error with per-request baseUrl', async () => {
    const requests: string[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      requests.push(String(input));
      throw new TypeError('Synthetic cloud connection failure');
    });
    const languageModel = {
      availability: async () => 'available',
      create: async () => ({ prompt: async () => JSON.stringify(payload), destroy: () => undefined }),
    };
    vi.stubGlobal('window', { LanguageModel: languageModel });
    vi.stubGlobal('LanguageModel', languageModel);
    const browserSdk = pathToFileURL(resolve('node_modules/@firebase/ai/dist/esm/index.esm.js')).href;
    const { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } = await import(/* @vite-ignore */ browserSdk) as typeof import('firebase/ai');
    const app = initializeApp({ apiKey: 'synthetic', projectId: 'demo-sdk', appId: '1:123:web:test' }, 'sdk-fallback');
    try {
      const model = getGenerativeModel(getAI(app, { backend: new GoogleAIBackend() }), {
        mode: InferenceMode.PREFER_IN_CLOUD,
        inCloudParams: { model: 'gemini-2.5-flash-lite' },
      });
      const result = await model.generateContent('Fallback through SDK', { baseUrl: 'https://fault-injection.invalid', timeout: 2500 });
      expect(result.response.inferenceSource).toBe('on_device');
      expect(JSON.parse(result.response.text())).toEqual(payload);
      expect(requests).toHaveLength(1);
      expect(requests[0]).toContain('https://fault-injection.invalid');
    } finally {
      await deleteApp(app);
    }
  });

  it('passes structured text input through the real SDK to the browser model boundary', async () => {
    const prompts: unknown[] = [];
    const create = vi.fn(async () => ({
      prompt: async (input: unknown) => { prompts.push(input); return JSON.stringify(payload); },
      destroy: () => undefined,
    }));
    const languageModel = { availability: async () => 'available', create };
    vi.stubGlobal('window', { LanguageModel: languageModel });
    vi.stubGlobal('LanguageModel', languageModel);
    const browserSdk = pathToFileURL(resolve('node_modules/@firebase/ai/dist/esm/index.esm.js')).href;
    const { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } = await import(/* @vite-ignore */ browserSdk) as typeof import('firebase/ai');
    const app = initializeApp({ apiKey: 'synthetic', projectId: 'demo-sdk', appId: '1:123:web:test' }, 'sdk-integration');
    try {
      const ai = getAI(app, { backend: new GoogleAIBackend() });
      const model = getGenerativeModel(ai, {
        mode: InferenceMode.ONLY_ON_DEVICE,
        inCloudParams: { model: 'gemini-2.5-flash-lite' },
        onDeviceParams: { promptOptions: { responseConstraint: { type: 'object' } } },
      });
      const result = await model.generateContent('Actual SDK request');
      expect(result.response.inferenceSource).toBe('on_device');
      expect(JSON.parse(result.response.text())).toEqual(payload);
      expect(create).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(prompts)).toContain('Actual SDK request');
    } finally {
      await deleteApp(app);
    }
  });
});
