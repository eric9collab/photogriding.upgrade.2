import type { PhotoItem } from "../lib/photo-item";
import { formatDateLabel, isLowConfidenceDateSource } from "../utils/date";
import { drawSquareToCanvas, isSquareLike } from "../utils/crop";
import { loadBitmap, decodeImageElement } from "../utils/image";
import type { TimeZoneSetting } from "../utils/timezone";
import { resolveTimeZone } from "../utils/timezone";
import { describeSelectedEffectiveDate, detectOffByOneDayCandidates } from "../utils/date-candidates";
import type { DateCandidateConfidence } from "../lib/photo-item";

export type DetailsDrawerActions = {
  onClose: () => void;
  onEditDate: (id: string) => void;
  onEditCrop: (id: string) => void;
  onMenuAction: (action: "replace" | "remove", id: string) => void;
  onChooseDateSource: (id: string, field: string | null) => void;
  onShiftDateByDays: (id: string, deltaDays: number) => void;
  onMoveWithinDay: (id: string, delta: -1 | 1) => void;
};

function confidenceBadge(conf: DateCandidateConfidence): { label: string; cls: string } {
  switch (conf) {
    case "high":
      return { label: "高", cls: "bg-emerald-500/10 text-emerald-200 ring-1 ring-emerald-400/20" };
    case "medium":
      return { label: "中", cls: "bg-sky-500/10 text-sky-200 ring-1 ring-sky-400/20" };
    case "low":
      return { label: "低", cls: "bg-amber-500/10 text-amber-200 ring-1 ring-amber-400/20" };
    case "very_low":
      return { label: "很低", cls: "bg-amber-500/10 text-amber-200 ring-1 ring-amber-400/20" };
    case "hint":
    default:
      return { label: "提示", cls: "bg-zinc-500/10 text-zinc-200 ring-1 ring-white/15" };
  }
}

function formatCandidateDate(d: Date | undefined, timeZone: TimeZoneSetting): string {
  if (!d) return "—";
  const tz = resolveTimeZone(timeZone);
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).format(d);
}

export function renderDetailsDrawer(
  root: HTMLElement,
  item: PhotoItem,
  opts: { timeZone: TimeZoneSetting },
  actions: DetailsDrawerActions
) {
  root.textContent = "";
  root.className = "grid gap-4 rounded-panel bg-black/20 p-4 ring-1 ring-white/10";

  const header = document.createElement("div");
  header.className = "flex items-start justify-between gap-3";
  const title = document.createElement("div");
  title.className = "grid gap-1";
  const h = document.createElement("h3");
  h.className = "text-sm font-semibold text-zinc-50";
  h.textContent = "Details";
  const sub = document.createElement("div");
  sub.className = "text-xs text-zinc-300";
  sub.textContent = `日期：${formatDateLabel(item.effectiveDate, "fixed", opts.timeZone)}`;
  title.appendChild(h);
  title.appendChild(sub);
  header.appendChild(title);

  const close = document.createElement("button");
  close.type = "button";
  close.className = "rounded-md bg-white/5 px-2 py-1 text-xs text-zinc-200 ring-1 ring-white/10 hover:bg-white/10";
  close.textContent = "關閉";
  close.addEventListener("click", () => actions.onClose());
  header.appendChild(close);
  root.appendChild(header);

  const previewWrap = document.createElement("div");
  previewWrap.className = "relative aspect-square overflow-hidden rounded-lg bg-zinc-900 ring-1 ring-white/10";
  const skeleton = document.createElement("div");
  skeleton.className = "absolute inset-0 animate-pulse bg-zinc-800/60";
  previewWrap.appendChild(skeleton);
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 768;
  canvas.className = "absolute inset-0 h-full w-full";
  previewWrap.appendChild(canvas);
  root.appendChild(previewWrap);

  const buttons = document.createElement("div");
  buttons.className = "flex flex-wrap items-center gap-2";

  const bDate = document.createElement("button");
  bDate.type = "button";
  bDate.className =
    "rounded-md bg-white/10 px-3 py-2 text-xs font-medium text-zinc-50 ring-1 ring-white/15 hover:bg-white/15";
  bDate.textContent = "編輯日期";
  bDate.addEventListener("click", () => actions.onEditDate(item.id));
  buttons.appendChild(bDate);

  const bCrop = document.createElement("button");
  bCrop.type = "button";
  bCrop.className =
    "rounded-md bg-white/5 px-3 py-2 text-xs font-medium text-zinc-200 ring-1 ring-white/10 hover:bg-white/10";
  bCrop.textContent = "裁切";
  bCrop.addEventListener("click", () => actions.onEditCrop(item.id));
  buttons.appendChild(bCrop);

  const bReplace = document.createElement("button");
  bReplace.type = "button";
  bReplace.className =
    "rounded-md bg-white/5 px-3 py-2 text-xs font-medium text-zinc-200 ring-1 ring-white/10 hover:bg-white/10";
  bReplace.textContent = "替換";
  bReplace.addEventListener("click", () => actions.onMenuAction("replace", item.id));
  buttons.appendChild(bReplace);

  const bRemove = document.createElement("button");
  bRemove.type = "button";
  bRemove.className =
    "rounded-md bg-white/5 px-3 py-2 text-xs font-medium text-zinc-200 ring-1 ring-white/10 hover:bg-white/10";
  bRemove.textContent = "移除";
  bRemove.addEventListener("click", () => actions.onMenuAction("remove", item.id));
  buttons.appendChild(bRemove);

  const bUp = document.createElement("button");
  bUp.type = "button";
  bUp.className =
    "rounded-md bg-white/5 px-3 py-2 text-xs font-medium text-zinc-200 ring-1 ring-white/10 hover:bg-white/10";
  bUp.textContent = "上移（同日）";
  bUp.addEventListener("click", () => actions.onMoveWithinDay(item.id, -1));
  buttons.appendChild(bUp);

  const bDown = document.createElement("button");
  bDown.type = "button";
  bDown.className =
    "rounded-md bg-white/5 px-3 py-2 text-xs font-medium text-zinc-200 ring-1 ring-white/10 hover:bg-white/10";
  bDown.textContent = "下移（同日）";
  bDown.addEventListener("click", () => actions.onMoveWithinDay(item.id, +1));
  buttons.appendChild(bDown);

  root.appendChild(buttons);

  const info = document.createElement("div");
  info.className = "grid gap-2 rounded-lg bg-white/[0.03] p-3 ring-1 ring-white/10";
  const selected = describeSelectedEffectiveDate(item);
  const reason = document.createElement("div");
  reason.className = "text-xs text-zinc-200";
  reason.textContent = selected.reason;
  info.appendChild(reason);

  if (item.effectiveDateField && item.effectiveDateField !== "EXIF:DateTimeOriginal" && item.effectiveDateField !== "manual") {
    const warn = document.createElement("div");
    warn.className = "rounded-md bg-amber-500/10 px-2 py-2 text-xs text-amber-200 ring-1 ring-amber-400/20";
    warn.textContent = "不是從原始拍攝欄位取得，建議確認或手動修改";
    info.appendChild(warn);
  }

  if (isLowConfidenceDateSource(item.dateSource)) {
    const warn = document.createElement("div");
    warn.className = "rounded-md bg-amber-500/10 px-2 py-2 text-xs text-amber-200 ring-1 ring-amber-400/20";
    warn.textContent = "日期可信度較低（可能是匯出/複製時間），建議確認";
    info.appendChild(warn);
  }

  const off = detectOffByOneDayCandidates(item, opts.timeZone);
  if (off.fields.length > 0) {
    const warn = document.createElement("div");
    warn.className = "rounded-md bg-amber-500/10 px-2 py-2 text-xs text-amber-200 ring-1 ring-amber-400/20";
    warn.textContent = "疑似時區/UTC 截日期錯誤：顯示日期與部分候選只差一天，建議切換上方「時區」設定確認。";
    info.appendChild(warn);
  }

  root.appendChild(info);

  const controls = document.createElement("div");
  controls.className = "flex flex-wrap items-center justify-between gap-2";

  const selectWrap = document.createElement("label");
  selectWrap.className = "flex items-center gap-2 text-xs text-zinc-300";
  const selectLabel = document.createElement("span");
  selectLabel.textContent = "改用來源";
  const select = document.createElement("select");
  select.className = "h-8 rounded-md bg-white/5 px-2 text-xs text-zinc-100 ring-1 ring-white/10";
  const options: Array<{ value: string; label: string }> = [
    { value: "", label: "自動（依優先序）" },
    { value: "EXIF:DateTimeOriginal", label: "DateTimeOriginal" },
    { value: "EXIF:CreateDate", label: "CreateDate" },
    { value: "EXIF:DateTimeDigitized", label: "DateTimeDigitized" },
    { value: "XMP:CreateDate", label: "XMP CreateDate" },
    { value: "QuickTime:CreateDate", label: "QuickTime CreateDate" },
    { value: "QuickTime:MediaCreateDate", label: "QuickTime MediaCreateDate" },
    { value: "IPTC:DateCreated+TimeCreated", label: "IPTC DateCreated" },
    { value: "file.lastModified", label: "fallback（lastModified）" }
  ];
  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt.value;
    o.textContent = opt.label;
    select.appendChild(o);
  }
  select.value = item.dateOverrideField ?? "";
  select.addEventListener("change", () => {
    const v = select.value.trim();
    actions.onChooseDateSource(item.id, v.length ? v : null);
  });
  selectWrap.appendChild(selectLabel);
  selectWrap.appendChild(select);
  controls.appendChild(selectWrap);

  const shiftWrap = document.createElement("div");
  shiftWrap.className = "flex items-center gap-2";
  const minus = document.createElement("button");
  minus.type = "button";
  minus.className = "rounded-md bg-white/5 px-2 py-1 text-xs font-medium text-zinc-200 ring-1 ring-white/10 hover:bg-white/10";
  minus.textContent = "日期 -1 天";
  minus.addEventListener("click", () => actions.onShiftDateByDays(item.id, -1));
  const plus = document.createElement("button");
  plus.type = "button";
  plus.className = "rounded-md bg-white/5 px-2 py-1 text-xs font-medium text-zinc-200 ring-1 ring-white/10 hover:bg-white/10";
  plus.textContent = "日期 +1 天";
  plus.addEventListener("click", () => actions.onShiftDateByDays(item.id, +1));
  shiftWrap.appendChild(minus);
  shiftWrap.appendChild(plus);
  controls.appendChild(shiftWrap);

  root.appendChild(controls);

  const details = document.createElement("details");
  details.className = "rounded-lg bg-white/[0.03] ring-1 ring-white/10";
  const summary = document.createElement("summary");
  summary.className = "cursor-pointer select-none px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-white/5";
  summary.textContent = "日期來源詳情";
  details.appendChild(summary);

  const body = document.createElement("div");
  body.className = "grid gap-2 px-3 pb-3 text-xs text-zinc-200";
  const candidates = item.dateCandidates ?? [];
  if (candidates.length === 0) {
    const empty = document.createElement("div");
    empty.className = "text-zinc-400";
    empty.textContent = "（無候選日期）";
    body.appendChild(empty);
  } else {
    for (const c of candidates) {
      const row = document.createElement("div");
      const isSelected = Boolean(item.effectiveDateField && c.field === item.effectiveDateField);
      row.className =
        "grid gap-1 rounded-md px-2 py-2 ring-1 ring-white/10" +
        (isSelected ? " bg-white/10 ring-white/20" : " bg-white/[0.03]");

      const top = document.createElement("div");
      top.className = "flex items-center justify-between gap-2";
      const leftText = document.createElement("div");
      leftText.className = "truncate font-medium text-zinc-100";
      leftText.textContent =
        c.field === "EXIF:ModifyDate" || c.field === "EXIF:DateTime"
          ? `${c.field}（修改時間）`
          : c.field;
      const conf = confidenceBadge(c.confidence);
      const badge = document.createElement("span");
      badge.className = `inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium ${conf.cls}`;
      badge.textContent = conf.label;
      top.appendChild(leftText);
      top.appendChild(badge);
      row.appendChild(top);

      const raw = document.createElement("div");
      raw.className = "truncate text-zinc-400";
      raw.textContent = c.raw ? `原始：${c.raw}` : "原始：—";
      row.appendChild(raw);

      const localTime = document.createElement("div");
      localTime.className = "text-zinc-200";
      localTime.textContent = `本地時間：${formatCandidateDate(c.parsed, opts.timeZone)}`;
      row.appendChild(localTime);

      const displayDate = document.createElement("div");
      displayDate.className = "text-zinc-300 tabular-nums";
      displayDate.textContent = `顯示日期：${formatDateLabel(c.parsed, "fixed", opts.timeZone)}`;
      row.appendChild(displayDate);

      body.appendChild(row);
    }
  }

  details.appendChild(body);
  root.appendChild(details);

  void (async () => {
    const bitmap = await loadBitmap(item.file, { maxSide: 1280 });
    if (bitmap) {
      const mode = item.cropIsManual ? "cover" : isSquareLike(bitmap.width, bitmap.height) ? "contain" : item.cropMode;
      drawSquareToCanvas(canvas, bitmap, item.crop, mode, bitmap.width, bitmap.height);
      bitmap.close();
      skeleton.remove();
      return;
    }
    const img = await decodeImageElement(item.url);
    const mode =
      item.cropIsManual ? "cover" : isSquareLike(img.naturalWidth, img.naturalHeight) ? "contain" : item.cropMode;
    drawSquareToCanvas(canvas, img, item.crop, mode, img.naturalWidth, img.naturalHeight);
    skeleton.remove();
  })();
}
