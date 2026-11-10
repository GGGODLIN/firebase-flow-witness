import {
  buildHybridModelParams,
  type HybridRuntimeAdapter,
  type LanguageModelAvailabilityState,
} from '../core/flow-witness-engine.ts';
import { invokeFirebaseCloud, type CloudConfig } from './firebase-cloud.ts';
import type { SpriteImage } from './sprite-image.ts';
import type { RuntimeContract } from './verification-pipeline.ts';

type PromptContent =
  | { readonly type: 'text'; readonly value: string }
  | { readonly type: 'image'; readonly value: Blob };

interface PromptApiSession {
  prompt(
    input: ReadonlyArray<{ readonly role: 'user'; readonly content: readonly PromptContent[] }>,
    options?: Readonly<Record<string, unknown>>,
  ): Promise<string>;
  destroy?(): void;
}

interface PromptApiGlobal {
  create(options?: unknown): Promise<PromptApiSession>;
}

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
    invokeOnDevice: async ({ promptText, responseConstraint }) => {
      const languageModel = (globalThis as { LanguageModel?: PromptApiGlobal }).LanguageModel;
      if (!languageModel || typeof languageModel.create !== 'function') {
        throw new Error('window.LanguageModel is not available');
      }
      const session = await languageModel.create(compiled.onDeviceParams.createOptions);
      try {
        const content: PromptContent[] = [{ type: 'text', value: promptText }];
        if (options.sprite) {
          content.push({ type: 'image', value: options.sprite.blob });
        }
        return await session.prompt([{ role: 'user', content }], {
          responseConstraint,
          omitResponseConstraintInput: true,
        });
      } finally {
        session.destroy?.();
      }
    },
    // Without a Firebase project there is no cloud to call. Throwing (instead of
    // leaving the slot empty) makes the engine record "no model answered"; an
    // empty slot would make it replay the recorded verdict as an in_cloud answer.
    invokeInCloud: async ({ promptText, singleRequestOptions }) => {
      if (!options.cloud) {
        throw new Error(
          'Firebase env is not configured (NEXT_PUBLIC_FIREBASE_API_KEY, _PROJECT_ID, _APP_ID)',
        );
      }
      return invokeFirebaseCloud({
        config: options.cloud,
        inCloudParams: compiled.inCloudParams,
        promptText,
        sprite: options.sprite,
        singleRequestOptions,
        onRequestSent: (appCheckActive) => {
          appCheckGuardedRequest = appCheckActive;
        },
      });
    },
  };
}
