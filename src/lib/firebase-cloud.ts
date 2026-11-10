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
  ReCaptchaEnterpriseProvider,
  initializeAppCheck,
} from 'firebase/app-check';
import type { SingleRequestOptionsPayload } from '../core/flow-witness-engine.ts';
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
    recaptchaSiteKey: nonEmpty(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY),
    model: nonEmpty(process.env.NEXT_PUBLIC_FIREBASE_AI_MODEL),
  };
}

interface CloudService {
  readonly ai: AI;
  readonly appCheckActive: boolean;
}

let cloudService: Promise<CloudService> | null = null;

// Initialised on the first cloud call rather than on page load, so a page that
// never escalates (Confidential Mode, benign transitions) contacts no Google
// endpoint at all.
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
      // ADR-0001: App Check must exist before getAI() so the AI service binds it
      // and reuses the cached session token instead of minting one per request.
      let appCheckActive = false;
      if (config.recaptchaSiteKey) {
        initializeAppCheck(app, {
          provider: new ReCaptchaEnterpriseProvider(config.recaptchaSiteKey),
          isTokenAutoRefreshEnabled: true,
        });
        appCheckActive = true;
      }
      const ai = getAI(app, {
        backend: new GoogleAIBackend(),
        useLimitedUseAppCheckTokens: false,
      });
      return { ai, appCheckActive };
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
  readonly promptText: string;
  readonly sprite: SpriteImage | null;
  readonly singleRequestOptions?: SingleRequestOptionsPayload;
  // Called right before the request leaves, with whether App Check guards it.
  readonly onRequestSent?: (appCheckActive: boolean) => void;
}

export async function invokeFirebaseCloud(input: CloudInvocation): Promise<string> {
  const { ai, appCheckActive } = await getCloudService(input.config);
  // ONLY_IN_CLOUD: executeHybridInference() owns the fallback decision, so the
  // SDK must not silently answer on-device inside a call recorded as in_cloud.
  const model = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: input.inCloudParams as ModelParams,
  });
  const parts: Part[] = [{ type: 'text', text: input.promptText }];
  if (input.sprite) {
    parts.push({
      type: 'inlineData',
      inlineData: { mimeType: 'image/jpeg', data: input.sprite.base64 },
    });
  }
  input.onRequestSent?.(appCheckActive);
  const result = await model.generateContent(parts, input.singleRequestOptions);
  const source = result.response.inferenceSource;
  if (source !== undefined && source !== 'in_cloud') {
    throw new Error(`Expected an in_cloud answer, got ${source}`);
  }
  return result.response.text();
}
