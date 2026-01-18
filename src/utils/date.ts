import type { PhotoDateSource, PhotoItem } from "../lib/photo-item";
import { selectEffectiveDateFromCandidates } from "./date-candidates";
import type { TimeZoneSetting } from "./timezone";
import { getCalendarPartsInTimeZone } from "./timezone";
import { fallbackDateFromFile } from "./file-date";

export type DateLabelFormat = "fixed";

// "拍攝日期" 定義：以使用者所在時區（預設瀏覽器時區）解讀後，取其日曆日期（YYYY/M/D），不使用 UTC 日期。
export function computeEffectiveDate(item: PhotoItem): {
  effectiveDate?: Date;
  dateSource: PhotoDateSource;
  effectiveDateField?: string;
} {
  return selectEffectiveDateFromCandidates(item);
}

export function isLowConfidenceDateSource(source: PhotoDateSource): boolean {
  return source === "file" || source === "unknown";
}

export function formatDateLabel(
  date: Date | undefined,
  _fmt: DateLabelFormat,
  timeZone: TimeZoneSetting = "browser"
): string {
  if (!date) return "未知日期";
  const { year, month, day } = getCalendarPartsInTimeZone(date, timeZone);
  // Fixed output format: YYYY/M/D (no zero padding), based on the local calendar day in the chosen time zone.
  return `${year}/${month}/${day}`;
}

export function parseLocalDateTime(dateStr: string, timeStr?: string): Date | undefined {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return undefined;

  let hh = 0;
  let mm = 0;
  if (timeStr) {
    const parts = timeStr.split(":").map(Number);
    hh = parts[0] ?? 0;
    mm = parts[1] ?? 0;
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return undefined;
  }

  const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
  return Number.isFinite(dt.valueOf()) ? dt : undefined;
}

export { fallbackDateFromFile };
