import type { PhotoCrop } from "../lib/photo-item";
import { drawCroppedSquare, ensureValidSquareCrop, geometricCenterCrop } from "../utils/crop";
import { loadBitmap } from "../utils/image";
import { lockScroll } from "../utils/scroll-lock";

export type CropEditorOptions = {
  file: File;
  url: string;
  crop: PhotoCrop;
  autoCropConfidence?: number;
};

export type CropEditorResult = {
  crop: PhotoCrop;
  autoCropConfidence: number;
};

export type CropEditorController = {
  open: (opts: CropEditorOptions) => Promise<CropEditorResult | null>;
  close: () => void;
  isOpen: () => boolean;
};

export function mountCropEditor(): CropEditorController {
  const modal = document.querySelector<HTMLElement>("[data-crop-modal]");
  const canvas = modal?.querySelector<HTMLCanvasElement>("[data-crop-canvas]") ?? null;
  const zoom = modal?.querySelector<HTMLInputElement>("[data-crop-zoom]") ?? null;
  const save = modal?.querySelector<HTMLButtonElement>("[data-crop-save]") ?? null;
  const cancel = modal?.querySelector<HTMLButtonElement>("[data-crop-cancel]") ?? null;
  const recenter = modal?.querySelector<HTMLButtonElement>("[data-crop-recenter]") ?? null;
  const hint = modal?.querySelector<HTMLElement>("[data-crop-hint]") ?? null;

  if (!modal || !canvas || !zoom || !save || !cancel || !recenter || !hint) {
    return { open: async () => null, close: () => {}, isOpen: () => false };
  }

  let bitmap: ImageBitmap | null = null;
  let imageSize: { width: number; height: number } | null = null;
  let working: PhotoCrop | null = null;
  let workingConfidence = 0;
  let resolver: ((v: CropEditorResult | null) => void) | null = null;
  let unlockScroll: (() => void) | null = null;

  let pointerDown = false;
  let pointerStart: { x: number; y: number; w: number; h: number } | null = null;
  let cropStart: PhotoCrop | null = null;

  function cleanup() {
    pointerDown = false;
    pointerStart = null;
    cropStart = null;
    working = null;
    imageSize = null;
    workingConfidence = 0;
    if (bitmap) {
      bitmap.close();
      bitmap = null;
    }
  }

  function closeWith(result: CropEditorResult | null) {
    if (resolver) resolver(result);
    resolver = null;
    unlockScroll?.();
    unlockScroll = null;
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    modal.setAttribute("aria-hidden", "true");
    cleanup();
  }

  function render() {
    if (!bitmap || !working || !imageSize) return;
    working = ensureValidSquareCrop(working, imageSize.width, imageSize.height);
    drawCroppedSquare(canvas, bitmap, working);
    const minSide = Math.min(imageSize.width, imageSize.height);
    const z = minSide / working.size;
    zoom.value = String(Math.min(4, Math.max(1, z)));
    hint.textContent =
      workingConfidence < 0.35
        ? "自動裁切可信度較低，建議檢查裁切。"
        : "拖曳移動，調整縮放；儲存後套用到縮圖/預覽/匯出。";
  }

  function canvasToLocal(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, w: rect.width, h: rect.height };
  }

  cancel.addEventListener("click", () => closeWith(null));
  save.addEventListener("click", () => {
    if (!working) return closeWith(null);
    closeWith({ crop: working, autoCropConfidence: 1 });
  });
  recenter.addEventListener("click", () => {
    if (!imageSize) return;
    working = geometricCenterCrop(imageSize.width, imageSize.height);
    workingConfidence = 1;
    render();
  });

  zoom.addEventListener("input", () => {
    if (!working || !imageSize) return;
    const z = Number(zoom.value);
    if (!Number.isFinite(z) || z <= 0) return;
    const minSide = Math.min(imageSize.width, imageSize.height);
    const centerX = working.x + working.size / 2;
    const centerY = working.y + working.size / 2;
    const nextSize = Math.min(minSide, Math.max(32, minSide / z));
    working = { x: centerX - nextSize / 2, y: centerY - nextSize / 2, size: nextSize };
    render();
  });

  canvas.addEventListener("pointerdown", (e) => {
    if (!working) return;
    pointerDown = true;
    pointerStart = canvasToLocal(e);
    cropStart = { ...working };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!pointerDown || !pointerStart || !cropStart || !imageSize) return;
    const pos = canvasToLocal(e);
    const dx = pos.x - pointerStart.x;
    const dy = pos.y - pointerStart.y;
    const scale = cropStart.size / Math.max(1, pointerStart.w);
    working = { x: cropStart.x + dx * scale, y: cropStart.y + dy * scale, size: cropStart.size };
    render();
  });
  canvas.addEventListener("pointerup", () => {
    pointerDown = false;
    pointerStart = null;
    cropStart = null;
  });
  canvas.addEventListener("pointercancel", () => {
    pointerDown = false;
    pointerStart = null;
    cropStart = null;
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeWith(null);
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && resolver) closeWith(null);
  });

  return {
    async open(opts: CropEditorOptions) {
      if (resolver) closeWith(null);
      cleanup();
      workingConfidence = typeof opts.autoCropConfidence === "number" ? opts.autoCropConfidence : 0;

      bitmap = await loadBitmap(opts.file);
      if (!bitmap) return null;
      imageSize = { width: bitmap.width, height: bitmap.height };
      working = ensureValidSquareCrop(opts.crop, bitmap.width, bitmap.height);

      modal.classList.remove("hidden");
      modal.classList.add("flex");
      modal.setAttribute("aria-hidden", "false");
      unlockScroll?.();
      unlockScroll = lockScroll();
      render();

      return await new Promise<CropEditorResult | null>((resolve) => {
        resolver = resolve;
      });
    },
    close() {
      if (resolver) closeWith(null);
    },
    isOpen() {
      return Boolean(resolver);
    }
  };
}
