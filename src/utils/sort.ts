import type { PhotoItem } from "../lib/photo-item";
import type { TimeZoneSetting } from "./timezone";
import { getCalendarPartsInTimeZone, getLocalCalendarKey } from "./timezone";

export type SortDirection = "asc" | "desc";

export function dayKey(date: Date | undefined, timeZone: TimeZoneSetting = "browser"): string {
  return getLocalCalendarKey(date, timeZone);
}

function dayNumber(date: Date | undefined, timeZone: TimeZoneSetting): number {
  if (!date) return NaN;
  const { year, month, day } = getCalendarPartsInTimeZone(date, timeZone);
  if (![year, month, day].every((n) => Number.isFinite(n))) return NaN;
  return year * 10000 + month * 100 + day;
}

export function comparePhotoItems(
  a: PhotoItem,
  b: PhotoItem,
  direction: SortDirection,
  timeZone: TimeZoneSetting = "browser"
): number {
  const aKnown = Boolean(a.effectiveDate);
  const bKnown = Boolean(b.effectiveDate);
  if (aKnown !== bKnown) return aKnown ? -1 : 1;
  if (!aKnown && !bKnown) return a.orderKey - b.orderKey;

  const aDay = dayNumber(a.effectiveDate, timeZone);
  const bDay = dayNumber(b.effectiveDate, timeZone);
  if (aDay !== bDay) return direction === "asc" ? aDay - bDay : bDay - aDay;

  return a.orderKey - b.orderKey;
}

export function renumberManualOrder(items: PhotoItem[]): PhotoItem[] {
  return items.map((it, index) => ({ ...it, manualOrderIndex: index, orderKey: index }));
}
