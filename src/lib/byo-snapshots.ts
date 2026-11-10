import type { RecordedVerdicts, TransitionPair } from './verification-pipeline.ts';

export interface SnapshotSlot {
  readonly name: string;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly source: CanvasImageSource;
  readonly previewUrl: string;
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

export function buildByoPair(input: ByoPairInput): TransitionPair {
  const size: FrameSize = {
    width: Math.max(1, Math.round(input.before.width)),
    height: Math.max(1, Math.round(input.before.height)),
  };
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
