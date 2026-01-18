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

  let touchMode: "none" | "pan" | "pinch" = "none";
  let touchStartCrop: PhotoCrop | null = null;
  let touchStartDist = 0;
  let touchStartMid: { x: number; y: number; w: number } | null = null;

  function cleanup() {
    pointerDown = false;
    pointerStart = null;
    cropStart = null;
    touchMode = "none";
    touchStartCrop = null;
    touchStartDist = 0;
    touchStartMid = null;
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

  function touchToLocal(t: Touch) {
    const rect = canvas.getBoundingClientRect();
    return { x: t.clientX - rect.left, y: t.clientY - rect.top, w: rect.width, h: rect.height };
  }

  function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }

  function mid(a: { x: number; y: number }, b: { x: number; y: number }) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function clamp(n: number, min: number, max: number) {
    return Math.min(max, Math.max(min, n));
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
    if (e.pointerType === "touch") return;
    if (!working) return;
    pointerDown = true;
    pointerStart = canvasToLocal(e);
    cropStart = { ...working };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
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

  canvas.addEventListener(
    "touchstart",
    (e) => {
      if (!working) return;
      if (!imageSize) return;
      if (e.touches.length === 0) return;
      e.preventDefault();

      touchStartCrop = { ...working };
      const t0 = e.touches[0];
      if (!t0) return;
      const p0 = touchToLocal(t0);

      if (e.touches.length === 1) {
        touchMode = "pan";
        touchStartMid = { x: p0.x, y: p0.y, w: p0.w };
        return;
      }

      const t1 = e.touches[1];
      if (!t1) return;
      const p1 = touchToLocal(t1);
      touchMode = "pinch";
      touchStartDist = dist(p0, p1);
      const m = mid(p0, p1);
      touchStartMid = { x: m.x, y: m.y, w: p0.w };
    },
    { passive: false }
  );

  canvas.addEventListener(
    "touchmove",
    (e) => {
      if (!working || !imageSize || !touchStartCrop || !touchStartMid) return;
      if (e.touches.length === 0) return;
      e.preventDefault();

      const minSide = Math.min(imageSize.width, imageSize.height);
      const minSize = Math.max(32, minSide / 4);
      const maxSize = minSide;

      if (touchMode === "pan" && e.touches.length === 1) {
        const t0 = e.touches[0];
        if (!t0) return;
        const p0 = touchToLocal(t0);
        const dx = p0.x - touchStartMid.x;
        const dy = p0.y - touchStartMid.y;
        const scale = touchStartCrop.size / Math.max(1, touchStartMid.w);
        working = { x: touchStartCrop.x + dx * scale, y: touchStartCrop.y + dy * scale, size: touchStartCrop.size };
        render();
        return;
      }

      if (e.touches.length < 2) return;
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      if (!t0 || !t1) return;
      const p0 = touchToLocal(t0);
      const p1 = touchToLocal(t1);
      const currentDist = dist(p0, p1);
      const scaleFactor = touchStartDist > 0 ? currentDist / touchStartDist : 1;
      const nextSize = clamp(touchStartCrop.size / Math.max(0.001, scaleFactor), minSize, maxSize);

      const startCenter = { x: touchStartCrop.x + touchStartCrop.size / 2, y: touchStartCrop.y + touchStartCrop.size / 2 };
      const currentMid = mid(p0, p1);
      const mdx = currentMid.x - touchStartMid.x;
      const mdy = currentMid.y - touchStartMid.y;
      const startScale = touchStartCrop.size / Math.max(1, touchStartMid.w);
      const nextCenter = { x: startCenter.x + mdx * startScale, y: startCenter.y + mdy * startScale };

      working = { x: nextCenter.x - nextSize / 2, y: nextCenter.y - nextSize / 2, size: nextSize };
      render();
    },
    { passive: false }
  );

  canvas.addEventListener(
    "touchend",
    (e) => {
      if (e.touches.length === 0) {
        touchMode = "none";
        touchStartCrop = null;
        touchStartDist = 0;
        touchStartMid = null;
        return;
      }

      // If we lifted one finger during pinch, continue as pan with the remaining finger.
      if (e.touches.length === 1 && working) {
        const t0 = e.touches[0];
        if (!t0) return;
        const p0 = touchToLocal(t0);
        touchMode = "pan";
        touchStartCrop = { ...working };
        touchStartMid = { x: p0.x, y: p0.y, w: p0.w };
        return;
      }
    },
    { passive: false }
  );

  canvas.addEventListener(
    "touchcancel",
    () => {
      touchMode = "none";
      touchStartCrop = null;
      touchStartDist = 0;
      touchStartMid = null;
    },
    { passive: true }
  );

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
      unlockScroll = lockScroll({ allowScrollWithin: [modal] });
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
