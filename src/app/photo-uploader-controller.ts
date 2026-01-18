import type { PhotoItem } from "../lib/photo-item";
import { mountDropzone } from "../ui/Dropzone";
import { mountDateEditor } from "../ui/DateEditor";
import { mountCropEditor } from "../ui/CropEditor";
import { createPhotoCard } from "../ui/PhotoCard";
import { renderDetailsDrawer } from "../ui/DetailsDrawer";
import { renderPreviewGrid } from "../ui/PreviewGrid";
import { renderPreviewTimeline } from "../ui/PreviewTimeline";
import { renderPreviewTimelineMobile } from "../ui/PreviewTimelineMobile";
import { renderPreviewGif } from "../ui/PreviewGif";
import { computeEffectiveDate, fallbackDateFromFile } from "../utils/date";
import { computeAutoCropForFile } from "../utils/auto-crop";
import { drawSquareToContext } from "../utils/crop";
import { makeId } from "../utils/id";
import { createObjectURL, revokeObjectURL } from "../utils/object-url";
import { comparePhotoItems, dayKey, renumberManualOrder } from "../utils/sort";
import type { SortDirection } from "../utils/sort";
import { exportCollage } from "../utils/export";
import { exportGif } from "../utils/export-gif";
import { decodeImageElement, loadBitmap } from "../utils/image";
import { lockScroll } from "../utils/scroll-lock";
import {
  applyBatchDateHeuristics,
  extractDateCandidatesForFile,
  isAllowedOverrideField
} from "../utils/date-candidates";
import type { TimeZoneSetting } from "../utils/timezone";
import { shiftZonedCalendarDayKeepingTime } from "../utils/timezone";
import { isSupportedImageFile } from "../utils/file";

type PreviewMode = "grid" | "timeline" | "gif";
type PageMode = "organize" | "output";

type UiState = {
  mode: PageMode;
  sortDirection: SortDirection;
  previewMode: PreviewMode;
  previewColumns: number;
  thumbColumns: number;
  showDates: boolean;
  gifDelayMs: number;
  gifLoop: boolean;
  timeZone: TimeZoneSetting;
  openMenuId: string | null;
  selectedId: string | null;
  editingDateId: string | null;
  editingCropId: string | null;
  draggingId: string | null;
  draggingGroup: string | null;
  exporting: boolean;
};

type PickerAction =
  | { type: "replace"; targetId: string }
  | { type: "insert-before"; targetId: string }
  | { type: "insert-after"; targetId: string };

function createNewItem(file: File, manualOrderIndex: number): PhotoItem {
  const url = createObjectURL(file);
  const fallbackDate = fallbackDateFromFile(file);
  const base: PhotoItem = {
    id: makeId(),
    file,
    url,
    thumbUrl: undefined,
    importedAt: Date.now(),
    exifDate: undefined,
    fallbackDate: fallbackDate ?? undefined,
    manualDate: undefined,
    dateOverrideField: undefined,
    dateCandidates: undefined,
    dateSource: "unknown",
    effectiveDate: undefined,
    effectiveDateField: undefined,
    manualOrderIndex,
    orderKey: manualOrderIndex,
    crop: { x: 0, y: 0, size: 1 },
    cropMode: "cover",
    cropIsManual: false,
    autoCropConfidence: undefined
  };
  const computed = computeEffectiveDate(base);
  base.effectiveDate = computed.effectiveDate;
  base.dateSource = computed.dateSource;
  base.effectiveDateField = computed.effectiveDateField;
  return base;
}

export function initPhotoUploader(root: HTMLElement) {
  const empty = root.querySelector<HTMLElement>("[data-empty]");
  const grid = root.querySelector<HTMLElement>("[data-grid]");
  const drawer = root.querySelector<HTMLElement>("[data-drawer]");
  const summary = root.querySelector<HTMLElement>("[data-summary]");
  const mobileSummary = root.querySelector<HTMLButtonElement>("[data-mobile-summary]");
  const mobileExport = root.querySelector<HTMLButtonElement>("[data-mobile-export]");
  const organizeSection = root.querySelector<HTMLElement>("[data-organize]");
  const outputSection = root.querySelector<HTMLElement>("[data-output]");
  const sheet = root.querySelector<HTMLElement>("[data-sheet]");
  const sheetBackdrop = root.querySelector<HTMLElement>("[data-sheet-backdrop]");
  const sheetPanel = root.querySelector<HTMLElement>("[data-sheet-panel]");
  const sheetContent = root.querySelector<HTMLElement>("[data-sheet-content]");
  const toast = root.querySelector<HTMLElement>("[data-toast]");
  const exportSheet = root.querySelector<HTMLElement>("[data-export-sheet]");
  const exportSheetBackdrop = root.querySelector<HTMLElement>("[data-export-sheet-backdrop]");
  const exportSheetPanel = root.querySelector<HTMLElement>("[data-export-sheet-panel]");
  const exportSheetContent = root.querySelector<HTMLElement>("[data-export-sheet-content]");

  const previewRoot = root.querySelector<HTMLElement>("[data-preview]");
  let previewModeButtons = Array.from(
    root.querySelectorAll<HTMLButtonElement>("[data-preview-mode]")
  );
  const previewCols = root.querySelector<HTMLInputElement>("[data-preview-cols]");
  const previewColsValue = root.querySelector<HTMLElement>("[data-preview-cols-value]");
  const previewColsWrap = root.querySelector<HTMLElement>("[data-cols-wrap]");
  const previewGrid = root.querySelector<HTMLElement>("[data-preview-grid]");
  const previewTimeline = root.querySelector<HTMLElement>("[data-preview-timeline]");
  let previewGif = root.querySelector<HTMLElement>("[data-preview-gif]");
  const gifControls = root.querySelector<HTMLElement>("[data-gif-controls]");
  const gifSettings = root.querySelector<HTMLElement>("[data-gif-settings]");
  const gifWarning = root.querySelector<HTMLElement>("[data-gif-warning]");
  const showDatesToggles = Array.from(root.querySelectorAll<HTMLInputElement>("[data-show-dates]"));
  let gifDelayButtons = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-gif-delay]"));
  let gifLoopToggles = Array.from(root.querySelectorAll<HTMLInputElement>("[data-gif-loop]"));

  const sortButtons = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-sort]"));
  let exportButtons = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-export]"));
  const timeZoneSelect = root.querySelector<HTMLSelectElement>("[data-timezone]");
  const modeButtons = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-mode]"));
  const thumbCols = root.querySelector<HTMLInputElement>("[data-thumb-cols]");
  const thumbColsValue = root.querySelector<HTMLElement>("[data-thumb-cols-value]");
  const previewColsMobileWrap = root.querySelector<HTMLElement>("[data-preview-cols-mobile]");
  const previewColsMobileButtons = Array.from(
    root.querySelectorAll<HTMLButtonElement>("[data-preview-cols-btn]")
  );

  const dropExpanded = root.querySelector<HTMLElement>("[data-drop-expanded]");
  const dropCompact = root.querySelector<HTMLElement>("[data-drop-compact]");
  const dropActions = root.querySelector<HTMLElement>("[data-drop-actions]");

  if (
    !empty ||
    !grid ||
    !previewRoot ||
    !previewGrid ||
    !previewTimeline ||
    !drawer ||
    !summary ||
    !mobileSummary ||
    !organizeSection ||
    !outputSection ||
    !sheet ||
    !sheetBackdrop ||
    !sheetPanel ||
    !sheetContent ||
    !mobileSummary
  )
    return;

  if (!previewGif) {
    previewGif = document.createElement("div");
    previewGif.dataset.previewGif = "true";
    previewGif.className = "hidden";
    previewRoot.appendChild(previewGif);
  }

  function ensureGifUiIsPresent() {
    if (!root.querySelector<HTMLButtonElement>('[data-preview-mode="gif"]')) {
      const containers = Array.from(
        new Set(
          Array.from(root.querySelectorAll<HTMLButtonElement>("[data-preview-mode]"))
            .map((b) => b.parentElement)
            .filter((el): el is HTMLElement => Boolean(el))
        )
      );
      for (const container of containers) {
        if (container.querySelector('[data-preview-mode="gif"]')) continue;
        const template =
          container.querySelector<HTMLButtonElement>('[data-preview-mode="timeline"]') ??
          container.querySelector<HTMLButtonElement>('[data-preview-mode="grid"]') ??
          container.querySelector<HTMLButtonElement>("[data-preview-mode]");
        if (!template) continue;
        const gifBtn = template.cloneNode(true) as HTMLButtonElement;
        gifBtn.dataset.previewMode = "gif";
        gifBtn.textContent = "GIF";
        gifBtn.classList.remove("bg-white/10", "text-zinc-50");
        gifBtn.classList.add("text-zinc-300");
        container.appendChild(gifBtn);
      }
    }

    if (!root.querySelector<HTMLButtonElement>('[data-export="gif"]')) {
      const template =
        root.querySelector<HTMLButtonElement>('[data-export="png"]') ??
        root.querySelector<HTMLButtonElement>('[data-export="jpg"]');
      const container = template?.parentElement;
      if (template && container) {
        const gifBtn = template.cloneNode(true) as HTMLButtonElement;
        gifBtn.dataset.export = "gif";
        gifBtn.textContent = "匯出 GIF";
        gifBtn.className =
          "rounded-md bg-emerald-500/15 px-3 py-2 text-xs font-medium text-emerald-100 ring-1 ring-emerald-400/25 hover:bg-emerald-500/20";
        container.appendChild(gifBtn);
      }
    }

    previewModeButtons = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-preview-mode]"));
    exportButtons = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-export]"));
    gifDelayButtons = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-gif-delay]"));
    gifLoopToggles = Array.from(root.querySelectorAll<HTMLInputElement>("[data-gif-loop]"));
  }
  ensureGifUiIsPresent();

  const emptyDefaultText = empty.textContent ?? "尚未選取任何圖片。";

  let items: PhotoItem[] = [];
  let nextOrderIndex = 0;
  const itemRevision = new Map<string, number>();
  const processingQueue: string[] = [];
  let processingWorker: Promise<void> | null = null;

  const ui: UiState = {
    mode: "organize",
    sortDirection: "asc",
    previewMode: "grid",
    previewColumns: 4,
    thumbColumns: 5,
    showDates: true,
    gifDelayMs: 1000,
    gifLoop: true,
    timeZone: "browser",
    openMenuId: null,
    selectedId: null,
    editingDateId: null,
    editingCropId: null,
    draggingId: null,
    draggingGroup: null,
    exporting: false
  };

  const desktopMql = window.matchMedia("(min-width: 768px)");
  const bigPhoneMql = window.matchMedia("(min-width: 480px)");

  function isDesktop() {
    return desktopMql.matches;
  }

  function syncDefaultPreviewColumns() {
    if (isDesktop()) {
      ui.previewColumns = 4;
      return;
    }
    ui.previewColumns = 2;
  }

  function syncDefaultThumbColumns() {
    if (isDesktop()) return;
    ui.thumbColumns = bigPhoneMql.matches ? 3 : 2;
  }
  syncDefaultPreviewColumns();
  syncDefaultThumbColumns();
  desktopMql.addEventListener?.("change", () => {
    syncDefaultPreviewColumns();
    syncDefaultThumbColumns();
    render();
  });
  bigPhoneMql.addEventListener?.("change", () => {
    syncDefaultThumbColumns();
    render();
  });

  const dropzone = mountDropzone(root, {
    onFiles: (files) => handleIncomingFiles(files),
    onClearAll: () => clearAll()
  });
  const jsReady = root.querySelector<HTMLElement>("[data-js-ready]");
  if (jsReady) jsReady.classList.remove("hidden");
  const dateEditor = mountDateEditor();
  const cropEditor = mountCropEditor();

  const actionInput = document.createElement("input");
  actionInput.type = "file";
  actionInput.accept = "image/*";
  actionInput.className = "hidden";
  document.body.appendChild(actionInput);
  let pendingPickerAction: PickerAction | null = null;
  let toastTimer: number | null = null;
  let exportSheetOpen = false;
  let unlockExportSheetScroll: (() => void) | null = null;
  let unlockDetailsSheetScroll: (() => void) | null = null;
  let stopGifPreview: (() => void) | null = null;

  function setExportSheetOpen(open: boolean) {
    if (!exportSheet || !exportSheetPanel) return;
    exportSheetOpen = open;
    exportSheet.classList.toggle("hidden", !open);
    exportSheet.setAttribute("aria-hidden", open ? "false" : "true");
    if (!open) exportSheetPanel.style.transform = "";

    if (open) {
      if (!unlockExportSheetScroll) {
        unlockExportSheetScroll = lockScroll({
          allowScrollWithin: exportSheetContent ? [exportSheetContent] : []
        });
      }
    } else {
      unlockExportSheetScroll?.();
      unlockExportSheetScroll = null;
    }
  }

  function showToast(
    message: string,
    action?: { label: string; onClick: () => void }
  ) {
    if (!toast) {
      dropzone.setStatus(message);
      return;
    }
    toast.textContent = "";
    const row = document.createElement("div");
    row.className = "flex items-center gap-2";
    const msg = document.createElement("div");
    msg.className = "min-w-0 flex-1";
    msg.textContent = message;
    row.appendChild(msg);
    if (action) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "shrink-0 rounded-md bg-white/10 px-2 py-1 text-[11px] font-semibold text-zinc-50 ring-1 ring-white/15 hover:bg-white/15";
      btn.textContent = action.label;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        action.onClick();
      });
      row.appendChild(btn);
    }
    toast.appendChild(row);
    toast.classList.remove("hidden");
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.add("hidden");
    }, action ? 10_000 : 4200);
  }

  function showIncomingStatus(count: number) {
    if (count <= 0) return;
    const message = `已接收 ${count} 張（處理中…）`;
    dropzone.setStatus(message);
    if (items.length === 0) {
      empty.textContent = message;
      empty.classList.remove("hidden");
      grid.classList.add("hidden");
    }
  }

  function sortedItems(): PhotoItem[] {
    const sorted = [...items].sort((a, b) => comparePhotoItems(a, b, ui.sortDirection, ui.timeZone));
    return renumberManualOrder(sorted);
  }

  function updateControls() {
    const hasItems = items.length > 0;
    for (const button of modeButtons) {
      const isActive = button.dataset.mode === ui.mode;
      button.classList.toggle("bg-white/10", isActive);
      button.classList.toggle("text-zinc-50", isActive);
      button.classList.toggle("text-zinc-300", !isActive);
      button.classList.toggle("hover:text-zinc-100", !isActive);
    }

    for (const button of sortButtons) {
      const isActive = button.dataset.sort === ui.sortDirection;
      button.classList.toggle("bg-white/10", isActive);
      button.classList.toggle("text-zinc-50", isActive);
      button.classList.toggle("text-zinc-300", !isActive);
      button.classList.toggle("hover:text-zinc-100", !isActive);
    }

    for (const button of previewModeButtons) {
      const isActive = button.dataset.previewMode === ui.previewMode;
      button.classList.toggle("bg-white/10", isActive);
      button.classList.toggle("text-zinc-50", isActive);
      button.classList.toggle("text-zinc-300", !isActive);
      button.classList.toggle("hover:text-zinc-100", !isActive);
    }

    if (previewColsMobileWrap) previewColsMobileWrap.classList.toggle("hidden", ui.previewMode !== "grid");
    for (const button of previewColsMobileButtons) {
      const v = Number(button.dataset.previewColsBtn);
      const isActive = Number.isFinite(v) && v === ui.previewColumns;
      button.classList.toggle("bg-white/10", isActive);
      button.classList.toggle("text-zinc-50", isActive);
      button.classList.toggle("text-zinc-200", !isActive);
    }

    if (previewColsWrap) previewColsWrap.classList.toggle("hidden", ui.previewMode !== "grid");
    if (previewColsValue) previewColsValue.textContent = String(ui.previewColumns);
    if (timeZoneSelect) timeZoneSelect.value = ui.timeZone;
    if (thumbCols) thumbCols.value = String(ui.thumbColumns);
    if (thumbColsValue) thumbColsValue.textContent = String(ui.thumbColumns);
    for (const toggle of showDatesToggles) toggle.checked = ui.showDates;
    for (const toggle of gifLoopToggles) toggle.checked = ui.gifLoop;

    if (gifControls) gifControls.classList.toggle("hidden", ui.previewMode !== "gif");
    if (gifSettings) gifSettings.classList.toggle("hidden", ui.previewMode !== "gif");
    if (gifWarning) {
      const n = items.length;
      const show = ui.previewMode === "gif" && n >= 30;
      gifWarning.classList.toggle("hidden", !show);
      if (show) gifWarning.textContent = `提示：目前 ${n} 張，GIF 可能較大或生成時間較久（手機建議 30~60 張內）。`;
    }

    for (const button of gifDelayButtons) {
      const v = Number(button.dataset.gifDelay);
      const isActive = Number.isFinite(v) && v === ui.gifDelayMs;
      button.classList.toggle("bg-white/10", isActive);
      button.classList.toggle("text-zinc-50", isActive);
      button.classList.toggle("text-zinc-200", !isActive);
    }

    if (mobileExport) {
      mobileExport.classList.toggle("hidden", !(ui.mode === "output" && hasItems));
      mobileExport.disabled = ui.exporting || !hasItems;
      mobileExport.classList.toggle("opacity-60", ui.exporting || !hasItems);
      mobileExport.classList.toggle("cursor-not-allowed", ui.exporting || !hasItems);
      mobileExport.textContent = ui.previewMode === "gif" ? "匯出 GIF" : "匯出";
    }

    for (const b of exportButtons) {
      const isBusy = ui.exporting;
      b.disabled = isBusy;
      b.classList.toggle("opacity-60", isBusy);
      b.classList.toggle("cursor-not-allowed", isBusy);
      const fmt = b.dataset.export;
      const label = fmt === "jpg" ? "匯出 JPG" : fmt === "gif" ? "匯出 GIF" : "匯出 PNG";
      b.textContent = isBusy ? "正在產生…" : label;
      const shouldShow = ui.previewMode === "gif" ? fmt === "gif" : fmt === "png" || fmt === "jpg";
      b.classList.toggle("hidden", !shouldShow);
    }
  }

  function render() {
    const hasItems = items.length > 0;
    dropzone.setHasItems(hasItems);
    empty.classList.toggle("hidden", hasItems);
    previewRoot.classList.toggle("hidden", !hasItems);
    updateControls();

    if (dropExpanded) dropExpanded.classList.toggle("hidden", hasItems);
    if (dropCompact) dropCompact.classList.toggle("hidden", !hasItems);
    if (dropActions) dropActions.classList.toggle("hidden", hasItems);

    organizeSection.classList.toggle("hidden", ui.mode !== "organize");
    outputSection.classList.toggle("hidden", ui.mode !== "output");

    const lowDate = items.filter((it) => it.dateSource === "file" || it.dateSource === "unknown").length;
    const lowCrop = items.filter((it) => typeof it.autoCropConfidence === "number" && it.autoCropConfidence < 0.35).length;
    const warnCount = lowDate + lowCrop;
    const statusText = hasItems ? `已接收 ${items.length} 張 · 警示 ${warnCount}` : "尚未匯入圖片";
    mobileSummary.textContent = statusText;
    summary.classList.toggle("hidden", !(hasItems && ui.mode === "output"));
    if (hasItems && ui.mode === "output") summary.textContent = statusText;

    if (!hasItems) {
      stopGifPreview?.();
      stopGifPreview = null;
      grid.textContent = "";
      previewGrid.textContent = "";
      previewTimeline.textContent = "";
      previewGif.textContent = "";
      drawer.textContent = "";
      drawer.classList.add("hidden");
      sheet.classList.add("hidden");
      sheet.setAttribute("aria-hidden", "true");
      setExportSheetOpen(false);
      syncDetailsSheetScrollLock();
      return;
    }

    const current = sortedItems();
    items = current;

    if (ui.mode === "organize") {
      grid.classList.toggle("hidden", false);
      if (isDesktop()) {
        grid.className = "grid gap-2";
        (grid.style as CSSStyleDeclaration).gridTemplateColumns = `repeat(${ui.thumbColumns}, minmax(0, 1fr))`;
      } else {
        grid.className = "grid gap-2";
        (grid.style as CSSStyleDeclaration).gridTemplateColumns = `repeat(${ui.thumbColumns}, minmax(0, 1fr))`;
      }

      grid.textContent = "";
      for (const item of current) {
        grid.appendChild(
          createPhotoCard(
            {
              item,
              selectedId: ui.selectedId,
              openMenuId: ui.openMenuId,
              timeZone: ui.timeZone,
              showDates: ui.showDates,
              isMobile: !isDesktop()
            },
            {
              onSelect: (id) => selectItem(id),
              onMenuToggle: (id) => toggleMenu(id),
              onMenuAction: (action, id) => handleCardAction(action, id)
            }
          )
        );
      }

      const selected = ui.selectedId ? items.find((it) => it.id === ui.selectedId) : null;
      if (selected) {
        if (isDesktop()) {
          drawer.classList.remove("hidden");
          renderDetailsDrawer(
            drawer,
            selected,
            { timeZone: ui.timeZone },
            {
              onClose: () => selectItem(null),
              onEditDate: (id) => void openDateEditor(id),
              onEditCrop: (id) => void openCropEditor(id),
              onMenuAction: (action, id) => handleMenuAction(action, id),
              onChooseDateSource: (id, field) => setDateOverrideField(id, field),
              onShiftDateByDays: (id, deltaDays) => shiftCalendarDay(id, deltaDays),
              onMoveWithinDay: (id, delta) => moveWithinDayByDelta(id, delta)
            }
          );
          sheet.classList.add("hidden");
          sheet.setAttribute("aria-hidden", "true");
        } else {
          drawer.textContent = "";
          drawer.classList.add("hidden");
          sheet.classList.remove("hidden");
          sheet.setAttribute("aria-hidden", "false");
          renderDetailsDrawer(
            sheetContent,
            selected,
            { timeZone: ui.timeZone },
            {
              onClose: () => selectItem(null),
              onEditDate: (id) => void openDateEditor(id),
              onEditCrop: (id) => void openCropEditor(id),
              onMenuAction: (action, id) => handleMenuAction(action, id),
              onChooseDateSource: (id, field) => setDateOverrideField(id, field),
              onShiftDateByDays: (id, deltaDays) => shiftCalendarDay(id, deltaDays),
              onMoveWithinDay: (id, delta) => moveWithinDayByDelta(id, delta)
            }
          );
        }
      } else {
        drawer.textContent = "";
        drawer.classList.add("hidden");
        sheetContent.textContent = "";
        sheet.classList.add("hidden");
        sheet.setAttribute("aria-hidden", "true");
      }
    } else {
      grid.textContent = "";
      grid.classList.add("hidden");
      drawer.textContent = "";
      drawer.classList.add("hidden");
      sheetContent.textContent = "";
      sheet.classList.add("hidden");
      sheet.setAttribute("aria-hidden", "true");
    }

    syncDetailsSheetScrollLock();

    stopGifPreview?.();
    stopGifPreview = null;

    if (ui.previewMode === "grid") {
      previewTimeline.classList.add("hidden");
      previewGif.classList.add("hidden");
      previewGrid.classList.remove("hidden");
      renderPreviewGrid(previewGrid, current, {
        columns: ui.previewColumns,
        showDates: ui.showDates,
        timeZone: ui.timeZone
      });
    } else if (ui.previewMode === "timeline") {
      previewGrid.classList.add("hidden");
      previewGif.classList.add("hidden");
      previewTimeline.classList.remove("hidden");
      if (isDesktop()) {
        renderPreviewTimeline(previewTimeline, current, {
          showDates: ui.showDates,
          timeZone: ui.timeZone
        });
      } else {
        renderPreviewTimelineMobile(previewTimeline, current, {
          showDates: ui.showDates,
          timeZone: ui.timeZone
        });
      }
    } else {
      previewGrid.classList.add("hidden");
      previewTimeline.classList.add("hidden");
      previewGif.classList.remove("hidden");
      const handle = renderPreviewGif(previewGif, current, {
        delayMs: ui.gifDelayMs,
        loop: ui.gifLoop,
        showDates: ui.showDates,
        timeZone: ui.timeZone
      });
      stopGifPreview = handle.cleanup;
    }
  }

  function syncDetailsSheetScrollLock() {
    const shouldLock = !isDesktop() && Boolean(ui.selectedId);
    if (shouldLock) {
      if (!unlockDetailsSheetScroll) {
        unlockDetailsSheetScroll = lockScroll({ allowScrollWithin: [sheetContent] });
      }
      return;
    }

    unlockDetailsSheetScroll?.();
    unlockDetailsSheetScroll = null;
  }

  function bumpRevision(id: string): number {
    const next = (itemRevision.get(id) ?? 0) + 1;
    itemRevision.set(id, next);
    return next;
  }

  function isIOSLike(): boolean {
    // Covers iPhone/iPad/iPod and iPadOS (MacIntel + touch points).
    const ua = navigator.userAgent ?? "";
    const platform = (navigator as any).platform ?? "";
    const touchPoints = (navigator as any).maxTouchPoints ?? 0;
    return /iP(hone|ad|od)/.test(ua) || (platform === "MacIntel" && touchPoints > 1);
  }

  async function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("無法產生縮圖"));
        },
        type,
        quality
      );
    });
  }

  async function generateSquareThumbnailUrl(
    item: PhotoItem,
    opts: { size?: number; jpegQuality?: number } = {}
  ): Promise<string | null> {
    const size = opts.size ?? 384;
    const jpegQuality = opts.jpegQuality ?? 0.86;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "rgba(9,9,11,1)";
    ctx.fillRect(0, 0, size, size);

    const bitmap = await loadBitmap(item.file);
    if (bitmap) {
      drawSquareToContext(ctx, bitmap, item.crop, item.cropMode, bitmap.width, bitmap.height, 0, 0, size);
      bitmap.close();
    } else {
      const img = await decodeImageElement(item.url);
      if (!(img.naturalWidth > 0 && img.naturalHeight > 0)) return null;
      drawSquareToContext(ctx, img, item.crop, item.cropMode, img.naturalWidth, img.naturalHeight, 0, 0, size);
    }

    try {
      const blob = await canvasToBlob(canvas, "image/jpeg", jpegQuality);
      return createObjectURL(blob);
    } catch {
      try {
        const blob = await canvasToBlob(canvas, "image/png");
        return createObjectURL(blob);
      } catch {
        return null;
      }
    }
  }

  function enqueueProcessing(ids: string[]) {
    for (const id of ids) processingQueue.push(id);
    if (!processingWorker) {
      processingWorker = (async () => {
        try {
          while (processingQueue.length) {
            const id = processingQueue.shift();
            if (!id) continue;
            await processOne(id);
            // Yield to the UI thread (important on iOS Safari).
            await new Promise((r) => setTimeout(r, 0));
          }
        } finally {
          processingWorker = null;
        }
      })();
    }
  }

  async function processOne(id: string) {
    const current = items.find((it) => it.id === id);
    if (!current) return;
    const rev = bumpRevision(id);

    // 1) Date candidates (low-memory EXIF head parse)
    const dateCandidates = await extractDateCandidatesForFile(current.file, ui.timeZone);
    if ((itemRevision.get(id) ?? 0) !== rev) return;
    items = items.map((existing) => {
      if (existing.id !== id) return existing;
      const fallbackDate = fallbackDateFromFile(existing.file);
      const next: PhotoItem = {
        ...existing,
        exifDate: undefined,
        fallbackDate: fallbackDate ?? undefined,
        dateCandidates
      };
      const computed = computeEffectiveDate(next);
      next.effectiveDate = computed.effectiveDate;
      next.dateSource = computed.dateSource;
      next.effectiveDateField = computed.effectiveDateField;
      return next;
    });
    items = applyBatchDateHeuristics(items, ui.timeZone);
    render();

    // 2) Auto crop (sequential; do not override manual crop)
    const afterDate = items.find((it) => it.id === id);
    if (!afterDate) return;
    const result = await computeAutoCropForFile(afterDate.file, afterDate.url);
    if ((itemRevision.get(id) ?? 0) !== rev) return;
    if (result) {
      items = items.map((existing) => {
        if (existing.id !== id) return existing;
        if (existing.cropIsManual) return existing;
        return {
          ...existing,
          crop: result.crop,
          cropMode: result.mode,
          cropIsManual: false,
          autoCropConfidence: result.confidence
        };
      });
      render();
    }

    // 3) Square thumbnail blob (used for all previews to keep memory low)
    const afterCrop = items.find((it) => it.id === id);
    if (!afterCrop) return;
    const thumbUrl = await generateSquareThumbnailUrl(afterCrop);
    if (!thumbUrl) return;
    if ((itemRevision.get(id) ?? 0) !== rev) {
      revokeObjectURL(thumbUrl);
      return;
    }
    items = items.map((existing) => {
      if (existing.id !== id) return existing;
      if (existing.thumbUrl) revokeObjectURL(existing.thumbUrl);
      return { ...existing, thumbUrl };
    });
    render();
  }

  function scheduleDateRefresh(id: string) {
    const item = items.find((it) => it.id === id);
    if (!item) return;
    const rev = bumpRevision(id);

    void (async () => {
      const dateCandidates = await extractDateCandidatesForFile(item.file, ui.timeZone);
      if ((itemRevision.get(id) ?? 0) !== rev) return;
      items = items.map((existing) => {
        if (existing.id !== id) return existing;
        const fallbackDate = fallbackDateFromFile(existing.file);
        const next: PhotoItem = {
          ...existing,
          exifDate: undefined,
          fallbackDate: fallbackDate ?? undefined,
          dateCandidates
        };
        const computed = computeEffectiveDate(next);
        next.effectiveDate = computed.effectiveDate;
        next.dateSource = computed.dateSource;
        next.effectiveDateField = computed.effectiveDateField;
        return next;
      });
      items = applyBatchDateHeuristics(items, ui.timeZone);
      render();
    })();
  }

  function scheduleExifAndCropRefresh(id: string) {
    const item = items.find((it) => it.id === id);
    if (!item) return;
    const rev = bumpRevision(id);

    void (async () => {
      const dateCandidates = await extractDateCandidatesForFile(item.file, ui.timeZone);
      if ((itemRevision.get(id) ?? 0) !== rev) return;
      items = items.map((existing) => {
        if (existing.id !== id) return existing;
        const fallbackDate = fallbackDateFromFile(existing.file);
        const next: PhotoItem = {
          ...existing,
          exifDate: undefined,
          fallbackDate: fallbackDate ?? undefined,
          dateCandidates
        };
        const computed = computeEffectiveDate(next);
        next.effectiveDate = computed.effectiveDate;
        next.dateSource = computed.dateSource;
        next.effectiveDateField = computed.effectiveDateField;
        return next;
      });
      items = applyBatchDateHeuristics(items, ui.timeZone);
      render();
    })();

    void (async () => {
      const result = await computeAutoCropForFile(item.file, item.url);
      if ((itemRevision.get(id) ?? 0) !== rev) return;
      if (!result) return;
      items = items.map((existing) => {
        if (existing.id !== id) return existing;
        if (existing.cropIsManual) return existing;
        return {
          ...existing,
          crop: result.crop,
          cropMode: result.mode,
          cropIsManual: false,
          autoCropConfidence: result.confidence
        };
      });
      render();
    })();
  }

  function pickIncomingImages(files: File[]): File[] {
    const images = files.filter(isSupportedImageFile);
    showIncomingStatus(images.length);
    return images;
  }

  function handleIncomingFiles(files: File[]) {
    console.log("[Controller] handleIncomingFiles called with", files.length, "files");
    const images = pickIncomingImages(files);
    console.log("[Controller] Filtered to", images.length, "image files");
    
    if (files.length === 0) {
      const message = "沒有讀到檔案，請改用選擇檔案";
      console.warn("[Controller]", message);
      dropzone.setStatus(message);
      showToast(message);
      return;
    }
    if (images.length === 0) {
      const message = "沒有讀到圖片檔（僅支援 image/*），請改用選擇檔案";
      console.warn("[Controller]", message);
      dropzone.setStatus(message);
      showToast(message);
      return;
    }

    console.log("[Controller] Creating", images.length, "new items...");
    const newItems = images.map((f) => createNewItem(f, nextOrderIndex++));
    for (const it of newItems) itemRevision.set(it.id, 0);
    items = [...items, ...newItems];
    items = applyBatchDateHeuristics(items, ui.timeZone);
    dropzone.setStatus(`已收到 ${newItems.length} 張照片`);
    ui.mode = "organize";
    console.log("[Controller] Rendering", items.length, "total items");
    render();
    if (isIOSLike() && (newItems.length >= 3 || newItems.reduce((sum, it) => sum + it.file.size, 0) > 20 * 1024 * 1024)) {
      showToast("iOS 低記憶體模式：逐張處理中…請稍候（可先開始整理）");
    }
    enqueueProcessing(newItems.map((it) => it.id));
  }

  function clearAll() {
    dateEditor.close();
    cropEditor.close();
    for (const it of items) {
      revokeObjectURL(it.url);
      if (it.thumbUrl) revokeObjectURL(it.thumbUrl);
    }
    items = [];
    itemRevision.clear();
    ui.openMenuId = null;
    ui.selectedId = null;
    ui.editingDateId = null;
    ui.editingCropId = null;
    dropzone.setStatus("");
    empty.textContent = emptyDefaultText;
    render();
  }

  function removeItem(id: string) {
    const target = items.find((it) => it.id === id);
    if (!target) return;
    revokeObjectURL(target.url);
    if (target.thumbUrl) revokeObjectURL(target.thumbUrl);
    items = items.filter((it) => it.id !== id);
    itemRevision.delete(id);
    if (ui.editingDateId === id) dateEditor.close();
    if (ui.editingCropId === id) cropEditor.close();
    if (ui.openMenuId === id) ui.openMenuId = null;
    if (ui.selectedId === id) ui.selectedId = null;
    render();
  }

  function replaceItem(id: string, file: File) {
    const target = items.find((it) => it.id === id);
    if (!target) return;
    revokeObjectURL(target.url);
    if (target.thumbUrl) revokeObjectURL(target.thumbUrl);
    const url = createObjectURL(file);

    items = items.map((existing) => {
      if (existing.id !== id) return existing;
      const reset: PhotoItem = {
        ...existing,
        file,
        url,
        thumbUrl: undefined,
        importedAt: Date.now(),
        exifDate: undefined,
        fallbackDate: undefined,
        manualDate: undefined,
        dateCandidates: undefined,
        effectiveDateField: undefined,
        crop: { x: 0, y: 0, size: 1 },
        cropMode: "cover",
        cropIsManual: false,
        autoCropConfidence: undefined
      };
      const computed = computeEffectiveDate(reset);
      reset.effectiveDate = computed.effectiveDate;
      reset.dateSource = computed.dateSource;
      reset.effectiveDateField = computed.effectiveDateField;
      return reset;
    });

    ui.openMenuId = null;
    render();
    enqueueProcessing([id]);
  }

  function insertFilesAround(targetId: string, position: "before" | "after", files: File[]) {
    const imageFiles = files.filter(isSupportedImageFile);
    if (imageFiles.length === 0) {
      showToast("沒有讀到圖片檔（僅支援 image/*）");
      return;
    }

    const current = sortedItems();
    const index = current.findIndex((it) => it.id === targetId);
    if (index === -1) return;
    const insertIndex = position === "before" ? index : index + 1;

    const newItems = imageFiles.map((f) => createNewItem(f, 0));
    for (const it of newItems) itemRevision.set(it.id, 0);

    const next = [...current];
    next.splice(insertIndex, 0, ...newItems);
    items = applyBatchDateHeuristics(renumberManualOrder(next), ui.timeZone);
    render();
    enqueueProcessing(newItems.map((it) => it.id));
  }

  function toggleMenu(id: string) {
    ui.openMenuId = ui.openMenuId === id ? null : id;
    render();
  }

  function selectItem(id: string | null) {
    ui.selectedId = id;
    ui.openMenuId = null;
    render();
  }

  function moveWithinDayByDelta(id: string, delta: -1 | 1) {
    const current = sortedItems();
    const idx = current.findIndex((it) => it.id === id);
    if (idx === -1) return;
    const group = dayKey(current[idx]?.effectiveDate, ui.timeZone);
    const groupIndices = current
      .map((it, i) => ({ it, i }))
      .filter((x) => dayKey(x.it.effectiveDate, ui.timeZone) === group)
      .map((x) => x.i);
    const pos = groupIndices.indexOf(idx);
    const nextPos = pos + delta;
    if (pos === -1 || nextPos < 0 || nextPos >= groupIndices.length) return;
    const from = groupIndices[pos];
    const to = groupIndices[nextPos];
    const next = [...current];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    items = renumberManualOrder(next);
    render();
  }

  function handleCardAction(
    action: Parameters<import("../ui/PhotoCard").PhotoCardActions["onMenuAction"]>[0],
    id: string
  ) {
    if (action === "edit-date") {
      void openDateEditor(id);
      return;
    }
    if (action === "crop") {
      void openCropEditor(id);
      return;
    }
    handleMenuAction(action, id);
  }

  function handleMenuAction(action: PickerAction["type"] | "remove", id: string) {
    ui.openMenuId = null;
    if (action === "remove") {
      removeItem(id);
      return;
    }

    pendingPickerAction = action === "replace" ? { type: "replace", targetId: id } : { type: action, targetId: id };
    actionInput.multiple = action !== "replace";
    actionInput.value = "";
    actionInput.click();
  }

  async function openDateEditor(id: string) {
    ui.openMenuId = null;
    ui.editingDateId = id;
    const item = items.find((it) => it.id === id);
    const initial = item?.manualDate ?? item?.effectiveDate;
    const value = await dateEditor.open(initial);
    ui.editingDateId = null;
    if (!value) return;
    items = items.map((existing) => {
      if (existing.id !== id) return existing;
      const next: PhotoItem = { ...existing, manualDate: value, dateOverrideField: undefined };
      const computed = computeEffectiveDate(next);
      next.effectiveDate = computed.effectiveDate;
      next.dateSource = computed.dateSource;
      next.effectiveDateField = computed.effectiveDateField;
      return next;
    });
    render();
  }

  function setDateOverrideField(id: string, field: string | null) {
    const normalized = field && isAllowedOverrideField(field) ? field : null;
    items = items.map((existing) => {
      if (existing.id !== id) return existing;
      const next: PhotoItem = {
        ...existing,
        dateOverrideField: normalized ?? undefined,
        manualDate: undefined
      };
      const computed = computeEffectiveDate(next);
      next.effectiveDate = computed.effectiveDate;
      next.dateSource = computed.dateSource;
      next.effectiveDateField = computed.effectiveDateField;
      return next;
    });
    render();
  }

  function shiftCalendarDay(id: string, deltaDays: number) {
    const item = items.find((it) => it.id === id);
    if (!item?.effectiveDate) return;
    const shifted = shiftZonedCalendarDayKeepingTime(item.effectiveDate, deltaDays, ui.timeZone);
    if (!shifted) return;
    items = items.map((existing) => {
      if (existing.id !== id) return existing;
      const next: PhotoItem = { ...existing, manualDate: shifted, dateOverrideField: undefined };
      const computed = computeEffectiveDate(next);
      next.effectiveDate = computed.effectiveDate;
      next.dateSource = computed.dateSource;
      next.effectiveDateField = computed.effectiveDateField;
      return next;
    });
    render();
  }

  async function openCropEditor(id: string) {
    ui.openMenuId = null;
    ui.editingCropId = id;
    const item = items.find((it) => it.id === id);
    if (!item) {
      ui.editingCropId = null;
      return;
    }
    const result = await cropEditor.open({
      file: item.file,
      url: item.url,
      crop: item.crop,
      autoCropConfidence: item.autoCropConfidence
    });
    ui.editingCropId = null;
    if (!result) return;

    const rev = bumpRevision(id);
    const nextCrop = result.crop;
    const nextConfidence = result.autoCropConfidence;
    items = items.map((existing) => {
      if (existing.id !== id) return existing;
      if (existing.thumbUrl) revokeObjectURL(existing.thumbUrl);
      return {
        ...existing,
        crop: nextCrop,
        cropMode: "cover",
        cropIsManual: true,
        autoCropConfidence: nextConfidence,
        thumbUrl: undefined
      };
    });
    render();
    showToast("已儲存裁切，正在更新預覽…");

    // Cancel any queued background work for this item; we'll re-generate the preview immediately.
    for (let i = processingQueue.length - 1; i >= 0; i -= 1) {
      if (processingQueue[i] === id) processingQueue.splice(i, 1);
    }

    void (async () => {
      const latest = items.find((it) => it.id === id);
      if (!latest) return;
      const thumbUrl = await generateSquareThumbnailUrl(latest, { size: 384, jpegQuality: 0.84 });
      if (!thumbUrl) return;
      if ((itemRevision.get(id) ?? 0) !== rev) {
        revokeObjectURL(thumbUrl);
        return;
      }
      items = items.map((existing) => (existing.id === id ? { ...existing, thumbUrl } : existing));
      render();
    })();
  }

  function moveWithinDayGroup(sourceId: string, targetId: string, group: string) {
    const current = sortedItems();
    const from = current.findIndex((it) => it.id === sourceId);
    const to = current.findIndex((it) => it.id === targetId);
    if (from === -1 || to === -1 || from === to) return;
    if (dayKey(current[from]?.effectiveDate, ui.timeZone) !== group) return;
    if (dayKey(current[to]?.effectiveDate, ui.timeZone) !== group) return;
    const next = [...current];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    items = renumberManualOrder(next);
    render();
  }

  actionInput.addEventListener("change", () => {
    if (!pendingPickerAction) return;
    if (!actionInput.files || actionInput.files.length === 0) {
      pendingPickerAction = null;
      return;
    }
    const files = Array.from(actionInput.files);
    const action = pendingPickerAction;
    pendingPickerAction = null;

    if (action.type === "replace") {
      const file = files.find(isSupportedImageFile);
      if (!file) {
        showToast("沒有讀到圖片檔（僅支援 image/*）");
        return;
      }
      replaceItem(action.targetId, file);
      return;
    }
    if (action.type === "insert-before") {
      insertFilesAround(action.targetId, "before", files);
      return;
    }
    insertFilesAround(action.targetId, "after", files);
  });

  for (const button of sortButtons) {
    button.addEventListener("click", () => {
      const dir = button.dataset.sort;
      if (dir === "asc" || dir === "desc") ui.sortDirection = dir;
      render();
    });
  }

  for (const button of modeButtons) {
    button.addEventListener("click", () => {
      const m = button.dataset.mode;
      if (m === "organize" || m === "output") ui.mode = m;
      if (ui.mode !== "output") setExportSheetOpen(false);
      render();
    });
  }

  mobileSummary.addEventListener("click", () => {
    if (ui.mode === "output") {
      ui.mode = "organize";
      setExportSheetOpen(false);
      render();
    }
  });

  mobileExport?.addEventListener("click", () => {
    if (ui.mode !== "output") return;
    if (items.length === 0) return;
    if (ui.exporting) return;
    selectItem(null);
    if (ui.previewMode === "gif") {
      void beginExport("gif");
      return;
    }
    setExportSheetOpen(true);
  });

  exportSheetBackdrop?.addEventListener("click", () => setExportSheetOpen(false));
  exportSheetPanel?.addEventListener("pointerdown", (e) => {
    const target = e.target as Element | null;
    if (!target?.closest?.("[data-export-sheet-handle]")) return;
    let startY = e.clientY;
    let deltaY = 0;
    exportSheetPanel.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      deltaY = Math.max(0, ev.clientY - startY);
      exportSheetPanel.style.transform = `translateY(${deltaY}px)`;
    };
    const onUp = () => {
      exportSheetPanel.style.transform = "";
      exportSheetPanel.removeEventListener("pointermove", onMove);
      exportSheetPanel.removeEventListener("pointerup", onUp);
      exportSheetPanel.removeEventListener("pointercancel", onUp);
      if (deltaY > 90) setExportSheetOpen(false);
    };
    exportSheetPanel.addEventListener("pointermove", onMove);
    exportSheetPanel.addEventListener("pointerup", onUp);
    exportSheetPanel.addEventListener("pointercancel", onUp);
  });

  sheetBackdrop.addEventListener("click", () => selectItem(null));
  let sheetStartY = 0;
  let sheetDeltaY = 0;
  let sheetDragging = false;
  sheetPanel.addEventListener("pointerdown", (e) => {
    const target = e.target as Element | null;
    if (!target?.closest?.("[data-sheet-handle]")) return;
    sheetStartY = e.clientY;
    sheetDeltaY = 0;
    sheetDragging = true;
    sheetPanel.setPointerCapture(e.pointerId);
  });
  sheetPanel.addEventListener("pointermove", (e) => {
    if (!sheetDragging) return;
    sheetDeltaY = Math.max(0, e.clientY - sheetStartY);
    sheetPanel.style.transform = `translateY(${sheetDeltaY}px)`;
  });
  sheetPanel.addEventListener("pointerup", () => {
    if (!sheetDragging) return;
    sheetPanel.style.transform = "";
    if (sheetDeltaY > 90) selectItem(null);
    sheetStartY = 0;
    sheetDeltaY = 0;
    sheetDragging = false;
  });
  sheetPanel.addEventListener("pointercancel", () => {
    sheetPanel.style.transform = "";
    sheetStartY = 0;
    sheetDeltaY = 0;
    sheetDragging = false;
  });

  for (const button of previewModeButtons) {
    button.addEventListener("click", () => {
      const mode = button.dataset.previewMode;
      if (mode === "grid" || mode === "timeline" || mode === "gif") ui.previewMode = mode;
      render();
    });
  }

  if (thumbCols) {
    thumbCols.addEventListener("input", () => {
      const n = Number(thumbCols.value);
      if (n >= 2 && n <= 6) ui.thumbColumns = n;
      render();
    });
  }

  if (previewCols) {
    previewCols.addEventListener("input", () => {
      const n = Number(previewCols.value);
      if (n >= 2 && n <= 6) ui.previewColumns = n;
      render();
    });
  }

  for (const button of previewColsMobileButtons) {
    button.addEventListener("click", () => {
      const v = Number(button.dataset.previewColsBtn);
      if (![2, 3, 4].includes(v)) return;
      ui.previewColumns = v;
      render();
    });
  }

  for (const toggle of showDatesToggles) {
    toggle.addEventListener("change", () => {
      ui.showDates = toggle.checked;
      render();
    });
  }

  for (const button of gifDelayButtons) {
    button.addEventListener("click", () => {
      const v = Number(button.dataset.gifDelay);
      if (![500, 1000, 1500].includes(v)) return;
      ui.gifDelayMs = v;
      render();
    });
  }

  for (const toggle of gifLoopToggles) {
    toggle.addEventListener("change", () => {
      ui.gifLoop = toggle.checked;
      render();
    });
  }

  function beginExport(fmt: "png" | "jpg" | "gif") {
    if (ui.exporting) return Promise.resolve();
    if (items.length === 0) return Promise.resolve();
    if (exportSheetOpen) setExportSheetOpen(false);
    ui.exporting = true;
    render();
    return (async () => {
      try {
        if (fmt === "gif") {
          const sorted = sortedItems();
          let lastToastAt = 0;
          await exportGif(sorted, {
            size: 720,
            delayMs: ui.gifDelayMs,
            loop: ui.gifLoop,
            showDates: ui.showDates,
            timeZone: ui.timeZone,
            onProgress: (done, total) => {
              const now = Date.now();
              if (now - lastToastAt < 140) return;
              lastToastAt = now;
              showToast(`正在生成 GIF… ${done}/${total}`);
            }
          });
          return;
        }
        await exportCollage(items, {
          format: fmt,
          previewMode: ui.previewMode === "gif" ? "grid" : ui.previewMode,
          previewColumns: ui.previewColumns,
          sortDirection: ui.sortDirection,
          showDates: ui.showDates,
          timeZone: ui.timeZone
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "匯出時發生未知錯誤";
        if (fmt === "gif") {
          showToast(`匯出失敗：${message}`, {
            label: "重試",
            onClick: () => void beginExport("gif")
          });
          return;
        }
        showToast(`匯出失敗：${message}`);
      } finally {
        ui.exporting = false;
        render();
      }
    })();
  }

  for (const button of exportButtons) {
    button.addEventListener("click", () => {
      const fmt = button.dataset.export;
      if (fmt !== "png" && fmt !== "jpg" && fmt !== "gif") return;
      void beginExport(fmt);
    });
  }

  if (timeZoneSelect) {
    timeZoneSelect.addEventListener("change", () => {
      const v = timeZoneSelect.value;
      if (v === "browser" || v === "Asia/Taipei") ui.timeZone = v;
      items = applyBatchDateHeuristics(items, ui.timeZone);
      render();
      enqueueProcessing(items.map((it) => it.id));
    });
  }

  document.addEventListener("click", (e) => {
    if (!ui.openMenuId) return;
    const target = e.target as Element | null;
    if (target?.closest?.("[data-menu-root]")) return;
    ui.openMenuId = null;
    render();
  });

  grid.addEventListener("dragstart", (e) => {
    const target = e.target as Element | null;
    const card = target?.closest<HTMLElement>("[data-card]");
    const id = card?.dataset.id;
    const group = card?.dataset.group;
    if (!id || !group) return;
    ui.draggingId = id;
    ui.draggingGroup = group;
    try {
      e.dataTransfer?.setData("text/plain", id);
      e.dataTransfer?.setDragImage(card, 20, 20);
    } catch {
      // ignore
    }
  });

  grid.addEventListener("dragover", (e) => {
    const target = e.target as Element | null;
    const card = target?.closest<HTMLElement>("[data-card]");
    if (!card || !ui.draggingGroup) return;
    if (card.dataset.group !== ui.draggingGroup) return;
    e.preventDefault();
  });

  grid.addEventListener("drop", (e) => {
    const target = e.target as Element | null;
    const card = target?.closest<HTMLElement>("[data-card]");
    if (!card || !ui.draggingId || !ui.draggingGroup) return;
    if (card.dataset.group !== ui.draggingGroup) return;
    e.preventDefault();
    const targetId = card.dataset.id;
    if (targetId) moveWithinDayGroup(ui.draggingId, targetId, ui.draggingGroup);
    ui.draggingId = null;
    ui.draggingGroup = null;
  });

  grid.addEventListener("dragend", () => {
    ui.draggingId = null;
    ui.draggingGroup = null;
  });

  window.addEventListener("beforeunload", () => {
    for (const it of items) {
      revokeObjectURL(it.url);
      if (it.thumbUrl) revokeObjectURL(it.thumbUrl);
    }
  });

  render();
}
