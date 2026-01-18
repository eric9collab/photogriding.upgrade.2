import type { PhotoItem } from "../lib/photo-item";
import { formatDateLabel, isLowConfidenceDateSource } from "../utils/date";
import type { TimeZoneSetting } from "../utils/timezone";
import { dayKey } from "../utils/sort";
import { toRomanNumeral } from "../utils/timeline";

function groupByDay(items: PhotoItem[], timeZone: TimeZoneSetting): Array<{ day: string; items: PhotoItem[] }> {
  const out: Array<{ day: string; items: PhotoItem[] }> = [];
  for (const item of items) {
    const key = dayKey(item.effectiveDate, timeZone);
    const prev = out[out.length - 1];
    if (prev && prev.day === key) prev.items.push(item);
    else out.push({ day: key, items: [item] });
  }
  return out;
}

export function renderPreviewTimelineMobile(
  root: HTMLElement,
  items: PhotoItem[],
  opts: { showDates: boolean; timeZone: TimeZoneSetting }
) {
  root.textContent = "";
  root.className = "grid gap-4";

  const groups = groupByDay(items, opts.timeZone);

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex];
    const section = document.createElement("section");
    section.className = "grid grid-cols-[28px_1fr] gap-3";

    const rail = document.createElement("div");
    rail.className = "relative";
    const line = document.createElement("div");
    line.className = "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/18";
    rail.appendChild(line);
    const chip = document.createElement("div");
    chip.className =
      "absolute left-1/2 top-1 -translate-x-1/2 rounded-md bg-black/55 px-2 py-1 text-[11px] font-semibold text-zinc-100 ring-1 ring-white/15";
    chip.textContent = toRomanNumeral(groupIndex + 1);
    rail.appendChild(chip);
    section.appendChild(rail);

    const body = document.createElement("div");
    body.className = "grid gap-2";

    const header = document.createElement("div");
    header.className = "flex items-center justify-between gap-2";

    const dot = document.createElement("div");
    dot.className = "h-2.5 w-2.5 rounded-full bg-white/65 ring-2 ring-white/10";
    header.appendChild(dot);

    if (opts.showDates) {
      const date = document.createElement("div");
      date.className =
        "min-w-0 rounded-md bg-black/55 px-2.5 py-1.5 text-xs font-semibold tabular-nums text-zinc-50 ring-1 ring-white/10";
      const labelDate = group.items[0]?.effectiveDate;
      date.textContent = formatDateLabel(labelDate, "fixed", opts.timeZone);
      if (group.items.some((it) => isLowConfidenceDateSource(it.dateSource))) {
        const warn = document.createElement("span");
        warn.className = "ml-1 text-amber-200";
        warn.textContent = "!";
        date.appendChild(warn);
      }
      header.appendChild(date);
    }
    body.appendChild(header);

    const thumbs = document.createElement("div");
    thumbs.className = "grid grid-cols-3 gap-2";
    const show = group.items.slice(0, 3);
    const remaining = Math.max(0, group.items.length - show.length);

    for (let i = 0; i < show.length; i += 1) {
      const item = show[i];
      const wrap = document.createElement("div");
      wrap.className = "relative aspect-square overflow-hidden rounded-lg bg-zinc-900 ring-1 ring-white/10";
      const skeleton = document.createElement("div");
      skeleton.className = "absolute inset-0 animate-pulse bg-zinc-800/60";
      wrap.appendChild(skeleton);

      if (item.thumbUrl) {
        const img = document.createElement("img");
        img.decoding = "async";
        img.loading = "lazy";
        img.src = item.thumbUrl;
        img.alt = "";
        img.className = "absolute inset-0 h-full w-full object-cover";
        img.addEventListener("load", () => skeleton.remove(), { once: true });
        wrap.appendChild(img);
      }

      if (remaining > 0 && i === show.length - 1) {
        const more = document.createElement("div");
        more.className =
          "absolute inset-x-2 bottom-2 rounded-md bg-black/60 px-2 py-1 text-center text-[11px] font-semibold text-zinc-50 ring-1 ring-white/10";
        more.textContent = `+${remaining}`;
        wrap.appendChild(more);
      }

      thumbs.appendChild(wrap);
    }
    body.appendChild(thumbs);

    section.appendChild(body);
    root.appendChild(section);
  }
}
