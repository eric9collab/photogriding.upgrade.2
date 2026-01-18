import type { PhotoItem } from "../lib/photo-item";
import { formatDateLabel, isLowConfidenceDateSource } from "../utils/date";
import type { TimeZoneSetting } from "../utils/timezone";
import { GRID_DATE_BADGE } from "../utils/grid-date-badge";

function gridColsClass(cols: number): string {
  if (cols === 2) return "grid-cols-2";
  if (cols === 3) return "grid-cols-3";
  if (cols === 4) return "grid-cols-4";
  if (cols === 5) return "grid-cols-5";
  return "grid-cols-6";
}

export function renderPreviewGrid(
  root: HTMLElement,
  items: PhotoItem[],
  opts: { columns: number; showDates: boolean; timeZone: TimeZoneSetting }
) {
  root.textContent = "";
  root.classList.remove("grid-cols-2", "grid-cols-3", "grid-cols-4", "grid-cols-5", "grid-cols-6");
  root.classList.add("grid", "gap-3", gridColsClass(opts.columns));

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const card = document.createElement("div");
    card.className = "relative aspect-square overflow-hidden rounded-lg bg-zinc-900 ring-1 ring-white/10";

    const skeleton = document.createElement("div");
    skeleton.className = "absolute inset-0 animate-pulse bg-zinc-800/60";
    card.appendChild(skeleton);

    if (item.thumbUrl) {
      const img = document.createElement("img");
      img.decoding = "async";
      img.loading = "lazy";
      img.src = item.thumbUrl;
      img.alt = "";
      img.className = "absolute inset-0 h-full w-full object-cover";
      img.addEventListener("load", () => skeleton.remove(), { once: true });
      card.appendChild(img);
    }

    if (opts.showDates) {
      const dateLabel = document.createElement("div");
      dateLabel.className = GRID_DATE_BADGE.domClass;
      dateLabel.textContent = formatDateLabel(item.effectiveDate, "fixed", opts.timeZone);
      if (isLowConfidenceDateSource(item.dateSource)) {
        const warn = document.createElement("span");
        warn.className = "ml-1 text-amber-200";
        warn.title = "日期可能不是原始拍攝日（可能是匯出/複製時間）";
        warn.textContent = "!";
        dateLabel.appendChild(warn);
      }
      card.appendChild(dateLabel);
    }

    root.appendChild(card);
  }
}
