import type { PhotoItem } from "../lib/photo-item";
import { formatDateLabel } from "./date";
import { drawSquareToContext, isSquareLike } from "./crop";
import { loadBitmap } from "./image";
import { createObjectURL, revokeObjectURL } from "./object-url";
import type { TimeZoneSetting } from "./timezone";
import { GRID_DATE_BADGE } from "./grid-date-badge";

type GifencApi = {
  GIFEncoder: (opts?: unknown) => {
    writeFrame: (index: Uint8Array, width: number, height: number, opts?: unknown) => void;
    finish: () => void;
    bytesView: () => Uint8Array;
  };
  quantize: (rgba: Uint8ClampedArray, maxColors: number) => unknown;
  applyPalette: (rgba: Uint8ClampedArray, palette: unknown) => Uint8Array;
};

let cachedGifenc: GifencApi | null = null;

async function loadGifencApi(): Promise<GifencApi> {
  if (cachedGifenc) return cachedGifenc;
  try {
    const mod = (await import("gifenc")) as any;
    const def = mod?.default;
    const GIFEncoder =
      (typeof mod?.GIFEncoder === "function" ? mod.GIFEncoder : null) ??
      (typeof def === "function" ? def : null) ??
      (typeof def?.GIFEncoder === "function" ? def.GIFEncoder : null);
    const quantize =
      (typeof mod?.quantize === "function" ? mod.quantize : null) ??
      (typeof def?.quantize === "function" ? def.quantize : null);
    const applyPalette =
      (typeof mod?.applyPalette === "function" ? mod.applyPalette : null) ??
      (typeof def?.applyPalette === "function" ? def.applyPalette : null);

    if (typeof GIFEncoder !== "function") throw new Error("GIFEncoder 匯入失敗");
    if (typeof quantize !== "function") throw new Error("quantize 匯入失敗");
    if (typeof applyPalette !== "function") throw new Error("applyPalette 匯入失敗");

    cachedGifenc = { GIFEncoder, quantize, applyPalette };
    return cachedGifenc;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`載入 GIF encoder 失敗：${message}`);
  }
}

export type ExportGifOptions = {
  size: number;
  delayMs: number;
  loop: boolean;
  showDates: boolean;
  timeZone: TimeZoneSetting;
  onProgress?: (done: number, total: number) => void;
};

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

async function downloadBlob(blob: Blob, filename: string) {
  const url = createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => revokeObjectURL(url), 10_000);
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function measureTabularWidth(ctx: CanvasRenderingContext2D, text: string): number {
  const digitW = Math.max(...Array.from({ length: 10 }, (_, d) => ctx.measureText(String(d)).width));
  let w = 0;
  for (const ch of text) {
    if (ch >= "0" && ch <= "9") w += digitW;
    else w += ctx.measureText(ch).width;
  }
  return w;
}

function fillTabularText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  const digitW = Math.max(...Array.from({ length: 10 }, (_, d) => ctx.measureText(String(d)).width));
  let cursor = x;
  for (const ch of text) {
    ctx.fillText(ch, cursor, y);
    cursor += ch >= "0" && ch <= "9" ? digitW : ctx.measureText(ch).width;
  }
}

function drawGridDateBadge(
  ctx: CanvasRenderingContext2D,
  text: string,
  tileX: number,
  tileY: number,
  tileSize: number,
  scale: number
) {
  const padX = GRID_DATE_BADGE.padX * scale;
  const padY = GRID_DATE_BADGE.padY * scale;
  const margin = GRID_DATE_BADGE.marginPx * scale;

  ctx.font = `${GRID_DATE_BADGE.fontWeight} ${GRID_DATE_BADGE.fontSize * scale}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
  const w = measureTabularWidth(ctx, text) + padX * 2;
  const h = GRID_DATE_BADGE.height * scale;

  const right = tileX + tileSize - margin;
  const bottom = tileY + tileSize - margin;
  const x = right - w;
  const y = bottom - h;
  const r = GRID_DATE_BADGE.radius * scale;

  ctx.fillStyle = GRID_DATE_BADGE.bg;
  ctx.strokeStyle = GRID_DATE_BADGE.stroke;
  ctx.lineWidth = GRID_DATE_BADGE.lineWidth * scale;
  roundedRectPath(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = GRID_DATE_BADGE.text;
  fillTabularText(ctx, text, x + padX, y + h - padY);
}

export async function exportGif(items: PhotoItem[], options: ExportGifOptions) {
  const { GIFEncoder, applyPalette, quantize } = await loadGifencApi();
  const size = clampInt(options.size, 320, 1080);
  const delayMs = clampInt(options.delayMs, 50, 10_000);
  const total = items.length;

  if (total <= 0) throw new Error("尚未匯入圖片");

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("無法取得 Canvas Context");

  const gif = GIFEncoder();
  const repeat = options.loop ? 0 : -1;
  const scale = 1;
  const bg = "rgba(9,9,11,1)";

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    options.onProgress?.(i, total);

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);

    const bitmap = await loadBitmap(item.file, { maxSide: size * 2 });
    if (bitmap) {
      const mode = item.cropIsManual
        ? "cover"
        : isSquareLike(bitmap.width, bitmap.height)
          ? "contain"
          : item.cropMode;
      drawSquareToContext(ctx, bitmap, item.crop, mode, bitmap.width, bitmap.height, 0, 0, size);
      bitmap.close();
    }

    if (options.showDates) {
      const labelText = formatDateLabel(item.effectiveDate, "fixed", options.timeZone);
      drawGridDateBadge(ctx, labelText, 0, 0, size, scale);
    }

    const imageData = ctx.getImageData(0, 0, size, size);
    const palette = quantize(imageData.data, 256);
    const index = applyPalette(imageData.data, palette);

    gif.writeFrame(index, size, size, {
      palette,
      delay: delayMs,
      repeat: i === 0 ? repeat : undefined
    });
  }

  options.onProgress?.(total, total);
  gif.finish();
  const bytes = gif.bytesView();
  const blob = new Blob([bytes], { type: "image/gif" });
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  await downloadBlob(blob, `photogriding-gif-${timestamp}.gif`);
}
