import {
  buildHybridModelParams,
  type HybridRuntimeAdapter,
  type LanguageModelAvailabilityState,
} from '../core/flow-witness-engine.ts';
import { invokeFirebaseHybrid, type CloudConfig } from './firebase-cloud.ts';
import type { SpriteImage } from './sprite-image.ts';
import type { RuntimeContract } from './verification-pipeline.ts';

export interface BrowserRuntimeOptions {
  readonly availability: LanguageModelAvailabilityState;
  readonly sprite: SpriteImage | null;
  readonly contract: RuntimeContract;
  readonly cloud: CloudConfig | null;
}

// One adapter per inference request, so the receipt's App Check flag describes
// that request only.
export function createBrowserHybridRuntime(options: BrowserRuntimeOptions): HybridRuntimeAdapter {
  const compiled = buildHybridModelParams({
    ...options.contract,
    cloudModel: options.cloud?.model,
  });
  let appCheckGuardedRequest = false;

  return {
    languageModelAvailability: options.availability,
    get appCheckInitialized() {
      return appCheckGuardedRequest;
    },
    invokeHybrid: async ({ promptText, singleRequestOptions }) => {
      if (!options.cloud) {
        throw new Error('Firebase env is not configured (NEXT_PUBLIC_FIREBASE_API_KEY, _PROJECT_ID, _APP_ID).');
      }
      return invokeFirebaseHybrid({
        config: options.cloud,
        mode: compiled.mode,
        inCloudParams: compiled.inCloudParams,
        onDeviceParams: {
          createOptions: {
            expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'image' }],
            expectedOutputs: [{ type: 'text', languages: ['en'] }],
            initialPrompts: [{ role: 'system', content: [{ type: 'text', value: options.contract.systemInstruction }] }],
          },
          promptOptions: compiled.onDeviceParams.promptOptions,
        },
        promptText,
        sprite: options.sprite,
        singleRequestOptions,
        onRequestSent: (active) => { appCheckGuardedRequest = active; },
      });
    },
  };
}
