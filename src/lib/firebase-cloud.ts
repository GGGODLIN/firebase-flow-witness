import {
  GoogleAIBackend,
  InferenceMode,
  getAI,
  getGenerativeModel,
  type AI,
  type ModelParams,
  type Part,
} from 'firebase/ai';
import { getApps, initializeApp } from 'firebase/app';
import {
  CustomProvider,
  ReCaptchaEnterpriseProvider,
  initializeAppCheck,
  getToken,
  type AppCheck,
} from 'firebase/app-check';
import { probeLanguageModelReadiness, type SingleRequestOptionsPayload } from '../core/flow-witness-engine.ts';
import type { SpriteImage } from './sprite-image.ts';

export interface CloudConfig {
  readonly apiKey: string;
  readonly projectId: string;
  readonly appId: string;
  readonly recaptchaSiteKey?: string;
  readonly model?: string;
}

function nonEmpty(value: string | undefined): string | undefined {
  return value !== undefined && value.trim().length > 0 ? value.trim() : undefined;
}

// Next.js inlines NEXT_PUBLIC_* only for literal process.env.NAME references,
// so each variable is read by name instead of through a lookup table.
export function readCloudConfig(): CloudConfig | null {
  const apiKey = nonEmpty(process.env.NEXT_PUBLIC_FIREBASE_API_KEY);
  const projectId = nonEmpty(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  const appId = nonEmpty(process.env.NEXT_PUBLIC_FIREBASE_APP_ID);
  if (!apiKey || !projectId || !appId) {
    return null;
  }
  return {
    apiKey,
    projectId,
    appId,
    recaptchaSiteKey: nonEmpty(process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY)
      ?? nonEmpty(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY),
    model: nonEmpty(process.env.NEXT_PUBLIC_FIREBASE_AI_MODEL),
  };
}

interface CloudService {
  readonly ai: AI;
  readonly appCheckActive: boolean;
  readonly appCheck: AppCheck;
}

let cloudService: Promise<CloudService> | null = null;

// Defer Firebase initialization until the first requested inference.
// App Check refresh stays off so ONLY_ON_DEVICE does not exchange tokens.
function getCloudService(config: CloudConfig): Promise<CloudService> {
  cloudService ??= Promise.resolve()
    .then(() => {
      const app =
        getApps()[0] ??
        initializeApp({
          apiKey: config.apiKey,
          projectId: config.projectId,
          appId: config.appId,
        });
      const globals = globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | true };
      const localDebug = process.env.NODE_ENV !== 'production' && typeof location !== 'undefined'
        && ['localhost', '127.0.0.1'].includes(location.hostname) && !config.recaptchaSiteKey;
      if (!localDebug) delete globals.FIREBASE_APPCHECK_DEBUG_TOKEN;
      const debug = localDebug && (globals.FIREBASE_APPCHECK_DEBUG_TOKEN === true
        || typeof globals.FIREBASE_APPCHECK_DEBUG_TOKEN === 'string');
      if (!config.recaptchaSiteKey && !debug) {
        throw new Error('App Check required: configure NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY; local development may supply a registered runtime App Check debug token.');
      }
      const appCheck = initializeAppCheck(app, {
        provider: config.recaptchaSiteKey
          ? new ReCaptchaEnterpriseProvider(config.recaptchaSiteKey)
          : new CustomProvider({
              getToken: async () => {
                throw new Error('Debug token exchange required; no custom attestation token is supplied.');
              },
            }),
        isTokenAutoRefreshEnabled: false,
      });
      const appCheckActive = true;
      const ai = getAI(app, {
        backend: new GoogleAIBackend(),
        useLimitedUseAppCheckTokens: false,
      });
      return { ai, appCheckActive, appCheck };
    })
    .catch((error: unknown) => {
      cloudService = null;
      throw error;
    });
  return cloudService;
}

export interface CloudInvocation {
  readonly config: CloudConfig;
  readonly inCloudParams: unknown;
  readonly mode?: import('firebase/ai').InferenceMode;
  readonly onDeviceParams?: import('firebase/ai').OnDeviceParams;
  readonly promptText: string;
  readonly sprite: SpriteImage | null;
  readonly singleRequestOptions?: SingleRequestOptionsPayload;
  readonly onAttempt?: (source: 'on_device' | 'in_cloud') => void;
  // True only when the SDK reports a cloud answer guarded by attestation.
  readonly onRequestSent?: (appCheckActive: boolean) => void;
}

export interface FirebaseAnswer {
  readonly text: string;
  readonly source: 'on_device' | 'in_cloud';
}

export async function invokeFirebaseHybrid(input: CloudInvocation): Promise<FirebaseAnswer> {
  if (input.mode === InferenceMode.ONLY_ON_DEVICE
    && (typeof window === 'undefined' || !(window as unknown as { LanguageModel?: unknown }).LanguageModel)) {
    throw new Error('Confidential inference blocked: browser LanguageModel is missing.');
  }
  const { ai, appCheckActive, appCheck } = await getCloudService(input.config);
  const mode = input.mode ?? InferenceMode.ONLY_IN_CLOUD;
  const localPreferred = mode === InferenceMode.PREFER_ON_DEVICE
    && (await probeLanguageModelReadiness()).canRunOnDeviceMultimodal;
  // Pin an available local preference to device-only so SDK availability races
  // cannot silently upload input without the cloud attestation preflight.
  const effectiveMode = localPreferred ? InferenceMode.ONLY_ON_DEVICE : mode;
  if (effectiveMode !== InferenceMode.ONLY_ON_DEVICE) {
    const attestation = await getToken(appCheck);
    if (!attestation.token) throw new Error('App Check token unavailable; inference stopped.');
  }
  const model = getGenerativeModel(ai, {
    mode: effectiveMode,
    inCloudParams: input.inCloudParams as ModelParams,
    onDeviceParams: input.onDeviceParams,
  });
  const parts: Part[] = [{ type: 'text', text: input.promptText }];
  if (input.sprite) {
    parts.push({
      type: 'inlineData',
      inlineData: { mimeType: 'image/jpeg', data: input.sprite.base64 },
    });
  }
  input.onAttempt?.(effectiveMode === InferenceMode.ONLY_ON_DEVICE ? 'on_device' : 'in_cloud');
  const result = await model.generateContent(parts, input.singleRequestOptions);
  const source = result.response.inferenceSource;
  if (source !== 'in_cloud' && source !== 'on_device') {
    throw new Error('Firebase SDK did not report an inference source.');
  }
  input.onRequestSent?.(source === 'in_cloud' && appCheckActive);
  return { text: result.response.text(), source };
}
