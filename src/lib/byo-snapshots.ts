import type { RecordedVerdicts, TransitionPair } from './verification-pipeline.ts';

export const BYO_MAX_WIDTH = 640;
export const BYO_MAX_HEIGHT = 480;

export interface SnapshotSlot {
  readonly name: string;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly source: CanvasImageSource;
  readonly previewUrl: string;
  // Object URLs must be revoked; data URLs from the sample must not.
  readonly ownsPreviewUrl: boolean;
}

export async function readSnapshotFile(file: File): Promise<SnapshotSlot> {
  const bitmap = await createImageBitmap(file);
  return {
    name: file.name,
    mimeType: file.type,
    width: bitmap.width,
    height: bitmap.height,
    source: bitmap,
    previewUrl: URL.createObjectURL(file),
    ownsPreviewUrl: true,
  };
}

export function releaseSnapshotSlot(slot: SnapshotSlot | null): void {
  if (slot?.ownsPreviewUrl) {
    URL.revokeObjectURL(slot.previewUrl);
  }
}

export interface FrameSize {
  readonly width: number;
  readonly height: number;
}

export function fitWithin(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): FrameSize {
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function rasterize(source: CanvasImageSource, size: FrameSize): Uint8ClampedArray {
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('2D canvas context is unavailable');
  }
  context.drawImage(source, 0, 0, size.width, size.height);
  return context.getImageData(0, 0, size.width, size.height).data;
}

export interface ByoPairInput {
  readonly title: string;
  readonly claim: string;
  readonly sourceSlice: string;
  readonly before: SnapshotSlot;
  readonly after: SnapshotSlot;
  readonly patched?: CanvasImageSource;
  readonly recorded?: RecordedVerdicts;
}

// pixelmatch needs equal dimensions, so the After frame is drawn into the
// Before frame's (bounded) size.
export function buildByoPair(input: ByoPairInput): TransitionPair {
  const size = fitWithin(
    input.before.width,
    input.before.height,
    BYO_MAX_WIDTH,
    BYO_MAX_HEIGHT,
  );
  return {
    id: 'BYO_CUSTOM',
    title: input.title,
    subtitle: `${input.before.name} → ${input.after.name} · ${size.width}×${size.height}`,
    expectedClaim: input.claim,
    width: size.width,
    height: size.height,
    beforeRgba: rasterize(input.before.source, size),
    afterRgba: rasterize(input.after.source, size),
    patchedAfterRgba: input.patched ? rasterize(input.patched, size) : undefined,
    domDelta: [],
    sourceSlice: input.sourceSlice,
    recorded: input.recorded,
  };
}

export const SAMPLE_WIDTH = 360;
export const SAMPLE_HEIGHT = 240;

export const SAMPLE_CLAIM =
  'Annual discount badge stays inside the Pro card at every viewport width';

export const SAMPLE_SOURCE_SLICE = [
  '/* PricingCard.css (sample) */',
  '.pricing-card--pro {',
  '  position: relative;',
  '}',
  '.pricing-card--pro .discount-badge {',
  '  position: absolute;',
  '  right: 108px; /* hardcoded for the 1280px layout */',
  '  top: 8px;',
  '  background: var(--color-success-500);',
  '}',
].join('\n');

export const SAMPLE_RECORDED: RecordedVerdicts = {
  triage: {
    verdict: 'layout_or_token_break',
    category: 'badge_collision',
    confidence: 0.9,
    reason:
      'The SAVE 20% badge left the Pro card header and now overlaps the Free tier column.',
  },
  escalation: {
    verdict: 'layout_or_token_break',
    rootCauseLine: 'PricingCard.css:7',
    explanation:
      'The discount badge uses a hardcoded right offset tuned for the desktop layout, which drags it across the card boundary at narrow widths.',
    cssOrStatePatch: 'right: var(--space-2, 8px);',
    patchedClaimResolved: true,
  },
};

type SampleVariant = 'before' | 'after';

function paintCard(
  context: CanvasRenderingContext2D,
  x: number,
  title: string,
  price: string,
  features: readonly string[],
  border: string,
): void {
  const y = 44;
  context.fillStyle = '#1e293b';
  context.fillRect(x, y, 156, 164);
  context.strokeStyle = border;
  context.lineWidth = 1;
  context.strokeRect(x + 0.5, y + 0.5, 155, 163);
  context.fillStyle = '#cbd5e1';
  context.font = '600 13px system-ui, sans-serif';
  context.fillText(title, x + 12, y + 22);
  context.fillStyle = '#f8fafc';
  context.font = '700 26px system-ui, sans-serif';
  context.fillText(price, x + 12, y + 58);
  context.fillStyle = '#94a3b8';
  context.font = '11px system-ui, sans-serif';
  context.fillText('per month', x + 12, y + 76);
  features.forEach((feature, row) => {
    context.fillText(`• ${feature}`, x + 12, y + 104 + row * 18);
  });
}

function paintPricingSample(
  context: CanvasRenderingContext2D,
  variant: SampleVariant,
): void {
  context.fillStyle = '#0f172a';
  context.fillRect(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
  context.textBaseline = 'alphabetic';
  context.fillStyle = '#e2e8f0';
  context.font = '600 15px system-ui, sans-serif';
  context.fillText('Choose your plan', 16, 28);

  paintCard(context, 16, 'Free', '$0', ['1 project', 'Community support'], '#334155');
  paintCard(context, 188, 'Pro', '$29', ['Unlimited projects', 'Priority support'], '#f59e0b');

  // The bug: a hardcoded offset drags the badge out of the Pro card onto Free.
  const badgeX = variant === 'before' ? 262 : 154;
  context.fillStyle = '#22c55e';
  context.fillRect(badgeX, 52, 74, 20);
  context.fillStyle = '#052e16';
  context.font = '700 11px system-ui, sans-serif';
  context.fillText('SAVE 20%', badgeX + 9, 66);

  // A 0.4 px glyph shift changes only anti-aliased edge pixels: the noise Beat 0
  // is meant to strip without asking any model.
  context.fillStyle = '#64748b';
  context.font = '11px ui-monospace, monospace';
  context.fillText(
    'Prices updated 2 min ago',
    variant === 'before' ? 16 : 16.4,
    228,
  );
}

function renderSampleCanvas(variant: SampleVariant): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_WIDTH;
  canvas.height = SAMPLE_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D canvas context is unavailable');
  }
  paintPricingSample(context, variant);
  return canvas;
}

function canvasSlot(canvas: HTMLCanvasElement, name: string): SnapshotSlot {
  return {
    name,
    mimeType: 'image/png',
    width: canvas.width,
    height: canvas.height,
    source: canvas,
    previewUrl: canvas.toDataURL('image/png'),
    ownsPreviewUrl: false,
  };
}

export interface SampleSnapshots {
  readonly before: SnapshotSlot;
  readonly after: SnapshotSlot;
  // The patched render equals the Before frame: the patch moves the badge home.
  readonly patched: CanvasImageSource;
}

export function createSampleSnapshots(): SampleSnapshots {
  const beforeCanvas = renderSampleCanvas('before');
  return {
    before: canvasSlot(beforeCanvas, 'sample-before.png'),
    after: canvasSlot(renderSampleCanvas('after'), 'sample-after.png'),
    patched: beforeCanvas,
  };
}
