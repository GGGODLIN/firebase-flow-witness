import type { TransitionDiffResult } from '../core/flow-witness-engine.ts';

export interface SpriteImage {
  readonly blob: Blob;
  readonly base64: string;
  readonly width: number;
  readonly height: number;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      resolve(dataUrl.slice(dataUrl.indexOf(',') + 1));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('Could not read the sprite blob'));
    };
    reader.readAsDataURL(blob);
  });
}

export async function encodeRgbaAsJpeg(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  quality = 0.9,
): Promise<SpriteImage> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D canvas context is unavailable');
  }
  context.putImageData(
    new ImageData(new Uint8ClampedArray(rgba), width, height),
    0,
    0,
  );
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) {
          resolve(result);
        } else {
          reject(new Error('JPEG encoding of the sprite failed'));
        }
      },
      'image/jpeg',
      quality,
    );
  });
  return { blob, base64: await blobToBase64(blob), width, height };
}

// An empty diff has no regions to show a model, so no image is attached.
export async function encodeDiffSprite(
  diff: TransitionDiffResult,
): Promise<SpriteImage | null> {
  if (diff.clusteredRegions.length === 0) {
    return null;
  }
  return encodeRgbaAsJpeg(diff.spriteRgba, diff.spriteWidth, diff.spriteHeight);
}
