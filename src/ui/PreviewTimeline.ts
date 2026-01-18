import type { PhotoItem } from "../lib/photo-item";
import { formatDateLabel, isLowConfidenceDateSource } from "../utils/date";
import type { TimeZoneSetting } from "../utils/timezone";
import { buildDayOrdinals, chunkTimelineRows, TIMELINE_MAX_PER_ROW, toRomanNumeral } from "../utils/timeline";

function makeConnector(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "relative h-10 w-14";

  const line = document.createElement("div");
  line.className = "absolute left-0 right-0 top-1/2 h-[2px] -translate-y-1/2 bg-white/28";
  wrap.appendChild(line);

  const chevron = document.createElement("div");
  chevron.className =
    "absolute right-0 top-1/2 -translate-y-1/2 text-lg font-semibold text-zinc-200";
  chevron.textContent = "›";
  wrap.appendChild(chevron);

  return wrap;
}

function makeRowRail(sectionLabel: string): HTMLElement {
  const rail = document.createElement("div");
  rail.className = "relative";

  const line = document.createElement("div");
  // Subtle guide rail only: alignment/background segmentation, no arrows.
  line.className = "absolute inset-y-0 left-[24px] w-[2px] bg-white/16";
  rail.appendChild(line);

  if (sectionLabel) {
    const label = document.createElement("div");
    label.className =
      "absolute left-[24px] top-2 -translate-x-1/2 rounded-full bg-black/50 px-2.5 py-1 text-xs font-medium tracking-wide text-zinc-200 ring-1 ring-white/15";
    label.textContent = sectionLabel;
    rail.appendChild(label);
  }

  return rail;
}

function makeNodeMeta(
  item: PhotoItem,
  ordinal: { indexInDay: number; totalInDay: number } | undefined,
  timeZone: TimeZoneSetting,
  showDates: boolean
): HTMLElement {
  const meta = document.createElement("div");
  meta.className = "flex h-12 items-center gap-3";

  const dot = document.createElement("div");
  dot.className = "h-3.5 w-3.5 rounded-full bg-white/40 ring-2 ring-white/60";
  meta.appendChild(dot);

  if (showDates) {
    const label = document.createElement("div");
    // Per requirements: Timeline node dates must be CLEAR and NOT TOO FAINT.
    label.className = "truncate text-lg font-semibold leading-none tabular-nums text-zinc-50";
    label.textContent = formatDateLabel(item.effectiveDate, "fixed", timeZone);
    meta.appendChild(label);

    // Note: Per requirements, same-day photos should NOT show "1/2, 2/2" ordinals in the preview or export.

    if (isLowConfidenceDateSource(item.dateSource)) {
      const dotSep = document.createElement("span");
      dotSep.className = "inline-block h-1 w-1 rounded-full bg-amber-200/90";
      meta.appendChild(dotSep);

      const warn = document.createElement("span");
      warn.className = "text-amber-200";
      warn.title = "日期可能不是原始拍攝日（可能是匯出/複製時間）";
      warn.textContent = "!";
      meta.appendChild(warn);
    }
  }

  return meta;
}

export function renderPreviewTimeline(
  root: HTMLElement,
  items: PhotoItem[],
  opts: { showDates: boolean; timeZone: TimeZoneSetting }
) {
  root.textContent = "";
  root.className = "grid gap-10";

  const rows = chunkTimelineRows(items, TIMELINE_MAX_PER_ROW);
  const ordinals = buildDayOrdinals(items, opts.timeZone);

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const rowItems = rows[rowIndex];
    const row = document.createElement("section");
    row.className = "grid grid-cols-[48px_1fr] gap-6";

    row.appendChild(makeRowRail(toRomanNumeral(rowIndex + 1)));

    const lane = document.createElement("div");
    lane.className = "grid items-start gap-x-4 gap-y-4";

    const baseParts = Array.from({ length: rowItems.length * 2 - 1 }, (_, i) =>
      i % 2 === 0 ? "minmax(0,1fr)" : "56px"
    );
    lane.style.gridTemplateColumns = baseParts.length ? baseParts.join(" ") : "minmax(0,1fr)";

    for (let i = 0; i < rowItems.length; i += 1) {
      const item = rowItems[i];
      const card = document.createElement("div");
      card.className = "grid gap-3";

      const meta = makeNodeMeta(item, ordinals.get(item.id), opts.timeZone, opts.showDates);
      card.appendChild(meta);

      const photo = document.createElement("div");
      photo.className = "relative aspect-square overflow-hidden rounded-lg bg-zinc-900 ring-1 ring-white/10";

      const skeleton = document.createElement("div");
      skeleton.className = "absolute inset-0 animate-pulse bg-zinc-800/60";
      photo.appendChild(skeleton);

      if (item.thumbUrl) {
        const img = document.createElement("img");
        img.decoding = "async";
        img.loading = "lazy";
        img.src = item.thumbUrl;
        img.alt = "";
        img.className = "absolute inset-0 h-full w-full object-cover";
        img.addEventListener("load", () => skeleton.remove(), { once: true });
        photo.appendChild(img);
      }

      card.appendChild(photo);

      lane.appendChild(card);

      if (i < rowItems.length - 1) lane.appendChild(makeConnector());
    }

    row.appendChild(lane);
    root.appendChild(row);
  }
}
