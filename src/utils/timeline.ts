import type { PhotoItem } from "../lib/photo-item";
import type { TimeZoneSetting } from "./timezone";
import { dayKey } from "./sort";

export type DayOrdinal = {
  indexInDay: number;
  totalInDay: number;
};

export const TIMELINE_MAX_PER_ROW = 3;

export function chunkTimelineRows(items: PhotoItem[], maxPerRow: number = TIMELINE_MAX_PER_ROW): PhotoItem[][] {
  const safeMax = Math.max(1, Math.floor(maxPerRow));
  const out: PhotoItem[][] = [];
  for (let i = 0; i < items.length; i += safeMax) out.push(items.slice(i, i + safeMax));
  return out;
}

export function toRomanNumeral(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  const table: Array<[number, string]> = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"]
  ];
  let remaining = Math.floor(n);
  let out = "";
  for (const [value, symbol] of table) {
    while (remaining >= value) {
      out += symbol;
      remaining -= value;
    }
  }
  return out;
}

export function buildDayOrdinals(items: PhotoItem[], timeZone: TimeZoneSetting): Map<string, DayOrdinal> {
  const groups = new Map<string, string[]>();
  for (const item of items) {
    const key = dayKey(item.effectiveDate, timeZone);
    const list = groups.get(key) ?? [];
    list.push(item.id);
    groups.set(key, list);
  }

  const out = new Map<string, DayOrdinal>();
  for (const ids of groups.values()) {
    const total = ids.length;
    for (let i = 0; i < ids.length; i += 1) {
      out.set(ids[i], { indexInDay: i + 1, totalInDay: total });
    }
  }
  return out;
}
