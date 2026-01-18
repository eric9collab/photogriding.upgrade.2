import type { PhotoCrop, PhotoCropMode } from "../lib/photo-item";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export type AutoCropResult = {
  crop: PhotoCrop;
  confidence: number;
};

export type SquareRenderMode = PhotoCropMode;

export function geometricCenterCrop(width: number, height: number): PhotoCrop {
  const size = Math.min(width, height);
  return {
    x: (width - size) / 2,
    y: (height - size) / 2,
    size
  };
}

export function isSquareLike(
  width: number,
  height: number,
  opts: { maxPixelDiff?: number; maxRelativeDiff?: number } = {}
): boolean {
  if (!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)) return false;
  const maxSide = Math.max(width, height);
  const diff = Math.abs(width - height);
  const maxPixelDiff = Math.max(0, opts.maxPixelDiff ?? 2);
  const maxRelativeDiff = Math.max(0, opts.maxRelativeDiff ?? 0.0015);
  const threshold = Math.max(maxPixelDiff, maxSide * maxRelativeDiff);
  return diff <= threshold;
}

export function ensureValidSquareCrop(crop: PhotoCrop, width: number, height: number): PhotoCrop {
  const minSide = Math.min(width, height);
  if (!Number.isFinite(crop.size) || crop.size <= 1 || crop.size > minSide) return geometricCenterCrop(width, height);
  const x = Math.min(Math.max(0, crop.x), width - crop.size);
  const y = Math.min(Math.max(0, crop.y), height - crop.size);
  return { x, y, size: crop.size };
}

export function drawSquareToCanvas(
  canvas: HTMLCanvasElement,
  image: CanvasImageSource,
  crop: PhotoCrop,
  mode: SquareRenderMode,
  srcWidth: number,
  srcHeight: number
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  drawSquareToContext(ctx, image, crop, mode, srcWidth, srcHeight, 0, 0, canvas.width);
}

export function drawSquareToContext(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  crop: PhotoCrop,
  mode: SquareRenderMode,
  srcWidth: number,
  srcHeight: number,
  destX: number,
  destY: number,
  destSize: number
) {
  if (mode === "contain") {
    const scale = Math.min(destSize / srcWidth, destSize / srcHeight);
    const dw = srcWidth * scale;
    const dh = srcHeight * scale;
    const dx = destX + (destSize - dw) / 2;
    const dy = destY + (destSize - dh) / 2;
    ctx.drawImage(image, 0, 0, srcWidth, srcHeight, dx, dy, dw, dh);
    return;
  }
  const safe = ensureValidSquareCrop(crop, srcWidth, srcHeight);
  ctx.drawImage(image, safe.x, safe.y, safe.size, safe.size, destX, destY, destSize, destSize);
}

export function drawCroppedSquare(
  canvas: HTMLCanvasElement,
  image: CanvasImageSource,
  crop: PhotoCrop
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.size,
    crop.size,
    0,
    0,
    canvas.width,
    canvas.height
  );
}

export function computeAutoCropFromImageData(
  imageData: ImageData,
  originalWidth: number,
  originalHeight: number,
  confidenceThreshold = 0.35
): AutoCropResult {
  const { data, width, height } = imageData;
  const lum = (i: number) => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];

  let sumW = 0;
  let sumX = 0;
  let sumY = 0;
  let sumX2 = 0;
  let sumY2 = 0;
  let maxW = 0;

  const total = width * height;
  if (total <= 0) return { crop: geometricCenterCrop(originalWidth, originalHeight), confidence: 0 };

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = (y * width + x) * 4;
      const gx = Math.abs(lum(idx + 4) - lum(idx - 4));
      const gy = Math.abs(lum(idx + width * 4) - lum(idx - width * 4));
      const w = gx + gy;
      sumW += w;
      sumX += x * w;
      sumY += y * w;
      sumX2 += x * x * w;
      sumY2 += y * y * w;
      if (w > maxW) maxW = w;
    }
  }

  if (!Number.isFinite(sumW) || sumW <= 0) {
    return { crop: geometricCenterCrop(originalWidth, originalHeight), confidence: 0 };
  }

  const cx = sumX / sumW;
  const cy = sumY / sumW;

  const varX = sumX2 / sumW - cx * cx;
  const varY = sumY2 / sumW - cy * cy;
  const normVar = (varX / (width * width) + varY / (height * height)) / 2;

  const meanW = sumW / total;
  const peakRatio = meanW > 0 ? maxW / meanW : 1;
  const confPeak = clamp((peakRatio - 1) / 6, 0, 1);
  const confSpread = clamp(1 - Math.sqrt(Math.max(0, normVar)) * 3, 0, 1);
  const confidence = clamp(confPeak * 0.7 + confSpread * 0.3, 0, 1);

  const scaleX = originalWidth / width;
  const scaleY = originalHeight / height;
  const centerX = cx * scaleX;
  const centerY = cy * scaleY;

  const size = Math.min(originalWidth, originalHeight);
  let crop: PhotoCrop = {
    x: clamp(centerX - size / 2, 0, originalWidth - size),
    y: clamp(centerY - size / 2, 0, originalHeight - size),
    size
  };

  if (confidence < confidenceThreshold) crop = geometricCenterCrop(originalWidth, originalHeight);
  return { crop, confidence };
}
