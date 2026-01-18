import type { DateCandidate, DateCandidateConfidence, PhotoItem } from "../lib/photo-item";
import { fallbackDateFromFile } from "./file-date";
import type { TimeZoneSetting } from "./timezone";
import { getCalendarPartsInTimeZone, getLocalCalendarKey, zonedLocalToInstant } from "./timezone";

// Priority order spec (do not change):
// 使用者手動指定（manual）
// EXIF:DateTimeOriginal（最常見真正拍攝時間）
// EXIF:CreateDate / EXIF:DateTimeDigitized（次佳）
// XMP:CreateDate（有些匯出會寫在這）
// IPTC:DateCreated + TimeCreated（有些匯出會寫在這）
// GPSDateStamp + GPSTimeStamp（若有，通常是 UTC）
// EXIF:ModifyDate / EXIF:DateTime（只作提示，不作拍攝日）
// file.lastModified（最後 fallback，低可信度）

const EFFECTIVE_PRIORITY_FIELDS = [
  "EXIF:DateTimeOriginal",
  "EXIF:CreateDate",
  "EXIF:DateTimeDigitized",
  "XMP:CreateDate",
  "QuickTime:CreateDate",
  "QuickTime:MediaCreateDate",
  "IPTC:DateCreated+TimeCreated",
  "GPS:GPSDateStamp+GPSTimeStamp",
  "file.lastModified"
] as const;

const NEVER_EFFECTIVE_FIELDS = ["EXIF:ModifyDate", "EXIF:DateTime"] as const;
export const ALLOWED_OVERRIDE_FIELDS = [
  "EXIF:DateTimeOriginal",
  "EXIF:CreateDate",
  "EXIF:DateTimeDigitized",
  "XMP:CreateDate",
  "QuickTime:CreateDate",
  "QuickTime:MediaCreateDate",
  "IPTC:DateCreated+TimeCreated",
  "file.lastModified"
] as const;

export function isAllowedOverrideField(field: string): field is (typeof ALLOWED_OVERRIDE_FIELDS)[number] {
  return (ALLOWED_OVERRIDE_FIELDS as readonly string[]).includes(field);
}

function isFiniteDate(d: Date): boolean {
  return Number.isFinite(d.valueOf());
}

function toRawString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return JSON.stringify(value);
  if (value && typeof value === "object") return JSON.stringify(value);
  return undefined;
}

function normalizeOffsetString(s: string): string {
  // Convert trailing ±HHMM into ±HH:MM for consistent parsing.
  const m = s.match(/([+-])(\d{2})(\d{2})$/);
  if (!m) return s;
  return s.slice(0, -5) + `${m[1]}${m[2]}:${m[3]}`;
}

function hasExplicitOffset(s: string): boolean {
  return /Z$|[+-]\d{2}:?\d{2}$/.test(s);
}

function parseDateStringWithRules(raw: string, timeZone: TimeZoneSetting): Date | undefined {
  const value = raw.trim();
  if (!value) return undefined;

  // If offset/UTC info exists, honor it.
  if (hasExplicitOffset(value)) {
    const dt = new Date(normalizeOffsetString(value));
    return isFiniteDate(dt) ? dt : undefined;
  }

  // EXIF common: "YYYY:MM:DD HH:mm:ss" (no offset => interpret as local).
  const exif = value.match(/^(\d{4}):(\d{2}):(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (exif) {
    const y = Number(exif[1]);
    const mo = Number(exif[2]);
    const d = Number(exif[3]);
    const hh = Number(exif[4] ?? "0");
    const mm = Number(exif[5] ?? "0");
    const ss = Number(exif[6] ?? "0");
    return zonedLocalToInstant(
      { year: y, month: mo, day: d, hour: exif[4] ? hh : 0, minute: exif[4] ? mm : 0, second: exif[4] ? ss : 0 },
      timeZone
    );
  }

  // ISO-like without offset: interpret as local.
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (iso) {
    const y = Number(iso[1]);
    const mo = Number(iso[2]);
    const d = Number(iso[3]);
    const hh = Number(iso[4] ?? "0");
    const mm = Number(iso[5] ?? "0");
    const ss = Number(iso[6] ?? "0");
    return zonedLocalToInstant(
      { year: y, month: mo, day: d, hour: iso[4] ? hh : 0, minute: iso[4] ? mm : 0, second: iso[4] ? ss : 0 },
      timeZone
    );
  }

  // Fallback: let Date try, but this may treat date-only as UTC in some cases.
  const dt = new Date(value);
  return isFiniteDate(dt) ? dt : undefined;
}

function parseCandidateDate(value: unknown, timeZone: TimeZoneSetting): Date | undefined {
  if (value instanceof Date) return isFiniteDate(value) ? value : undefined;
  if (typeof value === "number") {
    const dt = new Date(value);
    return isFiniteDate(dt) ? dt : undefined;
  }
  if (typeof value === "string") return parseDateStringWithRules(value, timeZone);
  return undefined;
}

function normalizeTimeZoneOffset(raw: unknown): string | undefined {
  if (typeof raw === "string") {
    const v = raw.trim();
    if (!v) return undefined;
    if (/^[+-]\\d{2}:\\d{2}$/.test(v)) return v;
    const hhmm = v.match(/^([+-])(\\d{2})(\\d{2})$/);
    if (hhmm) return `${hhmm[1]}${hhmm[2]}:${hhmm[3]}`;
    const hh = v.match(/^([+-])(\\d{2})$/);
    if (hh) return `${hh[1]}${hh[2]}:00`;
    return undefined;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const sign = raw < 0 ? "-" : "+";
    const hours = Math.min(23, Math.abs(Math.trunc(raw)));
    return `${sign}${String(hours).padStart(2, "0")}:00`;
  }
  if (Array.isArray(raw)) {
    const first = raw.find((v) => typeof v === "number" && Number.isFinite(v));
    return normalizeTimeZoneOffset(first);
  }
  return undefined;
}

function parseExifDateWithOptionalOffset(
  dateRaw: unknown,
  offsetRaw: unknown,
  timeZone: TimeZoneSetting
): Date | undefined {
  const offset = normalizeTimeZoneOffset(offsetRaw);
  if (typeof dateRaw === "string" && offset) {
    const exif = dateRaw
      .trim()
      .match(/^(\\d{4}):(\\d{2}):(\\d{2})(?:[ T](\\d{2}):(\\d{2})(?::(\\d{2}))?)?$/);
    if (exif && exif[4] && exif[5]) {
      const y = exif[1];
      const mo = exif[2];
      const d = exif[3];
      const hh = exif[4];
      const mm = exif[5];
      const ss = exif[6] ?? "00";
      const iso = `${y}-${mo}-${d}T${hh}:${mm}:${ss}${offset}`;
      const dt = new Date(iso);
      if (isFiniteDate(dt)) return dt;
    }
  }
  return parseCandidateDate(dateRaw, timeZone);
}

function gpsUtcDate(dateStamp: unknown, timeStamp: unknown): Date | undefined {
  if (typeof dateStamp !== "string" || !Array.isArray(timeStamp)) return undefined;

  const m = dateStamp.match(/^(\d{4}):(\d{2}):(\d{2})$/);
  if (!m) return undefined;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);

  const h = Number(timeStamp[0] ?? 0);
  const min = Number(timeStamp[1] ?? 0);
  const sec = Number(timeStamp[2] ?? 0);
  if (![y, mo, d, h, min, sec].every((n) => Number.isFinite(n))) return undefined;

  const dt = new Date(Date.UTC(y, mo - 1, d, h, min, sec, 0));
  return isFiniteDate(dt) ? dt : undefined;
}

function candidate(
  field: string,
  rawValue: unknown,
  parsed: Date | undefined,
  confidence: DateCandidateConfidence,
  usedForEffectiveDate: boolean
): DateCandidate {
  return {
    field,
    raw: toRawString(rawValue),
    parsed,
    confidence,
    usedForEffectiveDate
  };
}

export function buildFileLastModifiedCandidate(file: File): DateCandidate {
  return candidate(
    "file.lastModified",
    file.lastModified,
    fallbackDateFromFile(file),
    "low",
    true
  );
}

async function safeExifrParse(file: File, arg: unknown): Promise<any | null> {
  const exifr = await import("exifr");
  try {
    // Low-memory: only read the file header (enough for EXIF/XMP/QuickTime date tags).
    const head = new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer());
    return await (exifr as any).parse(head, arg as any);
  } catch {
    return null;
  }
}

function findXmpCreateDate(xmp: unknown): unknown {
  if (!xmp || typeof xmp !== "object") return undefined;
  const obj = xmp as Record<string, unknown>;
  if ("CreateDate" in obj) return obj.CreateDate;
  const key = Object.keys(obj).find((k) => k.toLowerCase().endsWith("createdate"));
  return key ? obj[key] : undefined;
}

export function effectivePriorityRank(field: string): number | null {
  const idx = EFFECTIVE_PRIORITY_FIELDS.indexOf(field as (typeof EFFECTIVE_PRIORITY_FIELDS)[number]);
  return idx === -1 ? null : idx + 1;
}

export function describeSelectedEffectiveDate(item: PhotoItem): {
  field?: string;
  rank?: number;
  confidence?: DateCandidateConfidence;
  reason: string;
} {
  if (item.manualDate) return { field: "manual", reason: "使用者手動指定" };

  if (item.dateOverrideField) {
    const confidence = item.dateCandidates?.find((c) => c.field === item.dateOverrideField)?.confidence;
    return {
      field: item.dateOverrideField,
      confidence,
      reason: "使用者改用指定的日期來源"
    };
  }

  const field = item.effectiveDateField;
  if (!field) return { reason: "未找到可用的拍攝日期" };

  const rank = effectivePriorityRank(field) ?? undefined;
  const confidence = item.dateCandidates?.find((c) => c.field === field)?.confidence;
  if (rank) return { field, rank, confidence, reason: `依固定優先序選用第 ${rank} 名候選` };
  return { field, confidence, reason: "依固定規則選用" };
}

function dayIndex(date: Date, timeZone: TimeZoneSetting): number {
  const { year, month, day } = getCalendarPartsInTimeZone(date, timeZone);
  if (![year, month, day].every((n) => Number.isFinite(n))) return NaN;
  return Math.floor(Date.UTC(year, month - 1, day, 0, 0, 0, 0) / 86_400_000);
}

export function detectOffByOneDayCandidates(
  item: PhotoItem,
  timeZone: TimeZoneSetting
): { fields: string[] } {
  if (!item.effectiveDate) return { fields: [] };
  const eff = dayIndex(item.effectiveDate, timeZone);
  if (!Number.isFinite(eff)) return { fields: [] };
  const fields: string[] = [];
  for (const c of item.dateCandidates ?? []) {
    if (!c.parsed) continue;
    if (item.effectiveDateField && c.field === item.effectiveDateField) continue;
    const idx = dayIndex(c.parsed, timeZone);
    if (!Number.isFinite(idx)) continue;
    if (Math.abs(idx - eff) === 1) fields.push(c.field);
  }
  return { fields };
}

export function selectEffectiveDateFromCandidates(item: PhotoItem): {
  effectiveDate?: Date;
  dateSource: PhotoItem["dateSource"];
  effectiveDateField?: string;
} {
  if (item.manualDate) return { effectiveDate: item.manualDate, dateSource: "manual" };

  if (item.dateOverrideField) {
    if (
      (NEVER_EFFECTIVE_FIELDS as readonly string[]).includes(item.dateOverrideField) ||
      !isAllowedOverrideField(item.dateOverrideField)
    ) {
      // Never allow overriding into "modify time" fields, and keep override constrained to the supported set.
    } else {
    const match = (item.dateCandidates ?? []).find((c) => c.field === item.dateOverrideField && c.parsed);
    if (match?.parsed) {
      return {
        effectiveDate: match.parsed,
        dateSource: item.dateOverrideField === "file.lastModified" ? "file" : "exif",
        effectiveDateField: item.dateOverrideField
      };
    }
    }
  }

  const list = item.dateCandidates ?? [];
  for (const field of EFFECTIVE_PRIORITY_FIELDS) {
    const match = list.find((c) => c.field === field && c.usedForEffectiveDate && c.parsed);
    if (!match?.parsed) continue;
    return {
      effectiveDate: match.parsed,
      dateSource: field === "file.lastModified" ? "file" : "exif",
      effectiveDateField: field
    };
  }

  if (item.fallbackDate) return { effectiveDate: item.fallbackDate, dateSource: "file" };
  if (item.exifDate) return { effectiveDate: item.exifDate, dateSource: "exif" };
  return { effectiveDate: undefined, dateSource: "unknown" };
}

function minuteBucketMs(ms: number): number {
  return Math.floor(ms / 60_000) * 60_000;
}

function demoteCandidate(
  c: DateCandidate,
  reason: "near-upload" | "batch-cluster" | "batch-same-day"
): DateCandidate {
  void reason;
  return { ...c, confidence: "very_low", usedForEffectiveDate: false };
}

export function applyBatchDateHeuristics(
  items: PhotoItem[],
  timeZone: TimeZoneSetting = "browser"
): PhotoItem[] {
  if (items.length === 0) return items;

  const total = items.length;
  const importedDayCounts = new Map<string, number>();
  const lastModifiedDayCounts = new Map<string, number>();
  const lastModifiedTimes: number[] = [];

  for (const it of items) {
    const importedKey = getLocalCalendarKey(new Date(it.importedAt), timeZone);
    importedDayCounts.set(importedKey, (importedDayCounts.get(importedKey) ?? 0) + 1);
    const lm = (it.dateCandidates ?? []).find((c) => c.field === "file.lastModified")?.parsed ?? it.fallbackDate;
    if (lm) {
      const ms = lm.valueOf();
      if (Number.isFinite(ms)) {
        lastModifiedTimes.push(ms);
        const lmKey = getLocalCalendarKey(new Date(ms), timeZone);
        lastModifiedDayCounts.set(lmKey, (lastModifiedDayCounts.get(lmKey) ?? 0) + 1);
      }
    }
  }

  const dominantImportedDay = [...importedDayCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const dominantLastModifiedDay = [...lastModifiedDayCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const dominantLastModifiedDayRatio =
    dominantLastModifiedDay ? (lastModifiedDayCounts.get(dominantLastModifiedDay) ?? 0) / total : 0;

  const lmRangeMs =
    lastModifiedTimes.length > 1
      ? Math.max(...lastModifiedTimes) - Math.min(...lastModifiedTimes)
      : 0;

  const demoteLastModifiedAsCapture =
    Boolean(dominantImportedDay) &&
    Boolean(dominantLastModifiedDay) &&
    dominantImportedDay === dominantLastModifiedDay &&
    dominantLastModifiedDayRatio >= 0.7 &&
    lmRangeMs <= 6 * 60 * 60_000;

  // Detect per-field "almost everyone has the same minute" clusters.
  const fieldMinuteCounts = new Map<string, Map<number, number>>();
  for (const it of items) {
    for (const c of it.dateCandidates ?? []) {
      if (!c.parsed) continue;
      if (!c.usedForEffectiveDate) continue;
      const ms = c.parsed.valueOf();
      if (!Number.isFinite(ms)) continue;
      const field = c.field;
      const bucket = minuteBucketMs(ms);
      const map = fieldMinuteCounts.get(field) ?? new Map<number, number>();
      map.set(bucket, (map.get(bucket) ?? 0) + 1);
      fieldMinuteCounts.set(field, map);
    }
  }

  const demoteFields = new Set<string>();
  for (const [field, counts] of fieldMinuteCounts) {
    if (field === "EXIF:DateTimeOriginal") continue;
    if (field === "GPS:GPSDateStamp+GPSTimeStamp") continue;
    if (field === "file.lastModified") continue;
    const top = [...counts.values()].sort((a, b) => b - a)[0] ?? 0;
    if (top >= 4 && top / total >= 0.8) demoteFields.add(field);
  }

  return items.map((it) => {
    const candidates = (it.dateCandidates ?? []).map((c) => {
      if (NEVER_EFFECTIVE_FIELDS.includes(c.field as (typeof NEVER_EFFECTIVE_FIELDS)[number])) {
        return { ...c, usedForEffectiveDate: false };
      }

      if (c.field === "file.lastModified" && demoteLastModifiedAsCapture) {
        return demoteCandidate(c, "batch-same-day");
      }

      if (demoteFields.has(c.field)) {
        return demoteCandidate(c, "batch-cluster");
      }

      if (c.parsed && c.usedForEffectiveDate) {
        const diffMs = Math.abs(c.parsed.valueOf() - it.importedAt);
        const nearUpload = diffMs <= 10 * 60_000;
        const shouldDemoteNearUpload =
          nearUpload &&
          c.field !== "EXIF:DateTimeOriginal" &&
          c.field !== "GPS:GPSDateStamp+GPSTimeStamp";
        if (shouldDemoteNearUpload) return demoteCandidate(c, "near-upload");
      }

      return c;
    });

    const next: PhotoItem = { ...it, dateCandidates: candidates };
    const selected = selectEffectiveDateFromCandidates(next);
    next.effectiveDate = selected.effectiveDate;
    next.dateSource = selected.dateSource;
    next.effectiveDateField = selected.effectiveDateField;
    return next;
  });
}

export async function extractJpegDateCandidates(
  file: File,
  timeZone: TimeZoneSetting = "browser"
): Promise<DateCandidate[]> {
  const picked = await safeExifrParse(file, {
    pick: [
      "DateTimeOriginal",
      "CreateDate",
      "DateTimeDigitized",
      "ModifyDate",
      "DateTime",
      "OffsetTime",
      "OffsetTimeOriginal",
      "TimeZoneOffset",
      "MediaCreateDate",
      "TrackCreateDate",
      "CreationDate"
    ],
    translateKeys: true,
    translateValues: false,
    reviveValues: false,
    sanitize: true,
    mergeOutput: true,
    silentErrors: true,
    tiff: true,
    exif: true,
    gps: true,
    iptc: true,
    xmp: { parse: true },
    quicktime: true
  });

  const output = await safeExifrParse(file, {
    translateKeys: true,
    translateValues: false,
    reviveValues: false,
    mergeOutput: false,
    tiff: true,
    exif: true,
    gps: true,
    iptc: true,
    xmp: { parse: true },
    quicktime: true
  });
  if (!output && !picked) return [buildFileLastModifiedCandidate(file)];

  const ifd0 = output?.ifd0 ?? {};
  const exif = output?.exif ?? {};
  const gps = output?.gps ?? {};
  const iptc = output?.iptc ?? {};
  const xmp = output?.xmp ?? {};
  const quicktime = output?.quicktime ?? {};
  const pickedObj = picked ?? {};
  const exifOffset =
    exif?.OffsetTimeOriginal ??
    exif?.OffsetTime ??
    exif?.TimeZoneOffset ??
    pickedObj?.OffsetTimeOriginal ??
    pickedObj?.OffsetTime ??
    pickedObj?.TimeZoneOffset;

  const list: DateCandidate[] = [];

  list.push(
    candidate(
      "EXIF:DateTimeOriginal",
      exif?.DateTimeOriginal ?? (picked as any)?.DateTimeOriginal,
      parseExifDateWithOptionalOffset(
        exif?.DateTimeOriginal ?? pickedObj?.DateTimeOriginal,
        exif?.OffsetTimeOriginal ?? exifOffset,
        timeZone
      ),
      "high",
      true
    )
  );
  list.push(
    candidate(
      "EXIF:CreateDate",
      exif?.CreateDate ?? (picked as any)?.CreateDate,
      parseExifDateWithOptionalOffset(
        exif?.CreateDate ?? pickedObj?.CreateDate,
        exif?.OffsetTime ?? exifOffset,
        timeZone
      ),
      "medium",
      true
    )
  );
  list.push(
    candidate(
      "EXIF:DateTimeDigitized",
      exif?.DateTimeDigitized ?? (picked as any)?.DateTimeDigitized,
      parseExifDateWithOptionalOffset(
        exif?.DateTimeDigitized ?? pickedObj?.DateTimeDigitized,
        exif?.OffsetTime ?? exifOffset,
        timeZone
      ),
      "medium",
      true
    )
  );

  const iptcDate = iptc?.DateCreated;
  const iptcTime = iptc?.TimeCreated;
  const iptcRaw = iptcDate && iptcTime ? `${toRawString(iptcDate)} ${toRawString(iptcTime)}` : iptcDate ?? undefined;
  const iptcParsed =
    typeof iptcDate === "string" && typeof iptcTime === "string"
      ? parseCandidateDate(`${iptcDate}T${iptcTime}`, timeZone)
      : parseCandidateDate(iptcDate, timeZone);
  const xmpCreate = findXmpCreateDate(xmp);
  list.push(
    candidate(
      "XMP:CreateDate",
      xmpCreate,
      parseCandidateDate(xmpCreate, timeZone),
      "medium",
      true
    )
  );
  list.push(candidate("IPTC:DateCreated+TimeCreated", iptcRaw, iptcParsed, "medium", true));

  // iPhone / Apple exports sometimes store capture time in QuickTime keys (especially for videos, but also some containers).
  list.push(
    candidate(
      "QuickTime:CreateDate",
      quicktime?.CreateDate,
      parseCandidateDate(quicktime?.CreateDate, timeZone),
      "medium",
      true
    )
  );
  list.push(
    candidate(
      "QuickTime:MediaCreateDate",
      quicktime?.MediaCreateDate,
      parseCandidateDate(quicktime?.MediaCreateDate, timeZone),
      "medium",
      true
    )
  );

  const gpsParsed = gpsUtcDate(gps?.GPSDateStamp, gps?.GPSTimeStamp);
  const gpsRaw =
    gps?.GPSDateStamp && gps?.GPSTimeStamp
      ? `${toRawString(gps?.GPSDateStamp)} ${toRawString(gps?.GPSTimeStamp)}`
      : undefined;
  list.push(candidate("GPS:GPSDateStamp+GPSTimeStamp", gpsRaw, gpsParsed, "medium", true));

  // Explicitly treat these as modify timestamps (hint only), never as capture time.
  list.push(
    candidate(
      "EXIF:ModifyDate",
      exif?.ModifyDate ?? (picked as any)?.ModifyDate,
      parseExifDateWithOptionalOffset(
        exif?.ModifyDate ?? pickedObj?.ModifyDate,
        exif?.OffsetTime ?? exifOffset,
        timeZone
      ),
      "hint",
      false
    )
  );
  list.push(
    candidate(
      "EXIF:DateTime",
      ifd0?.DateTime ?? (picked as any)?.DateTime,
      parseExifDateWithOptionalOffset(
        ifd0?.DateTime ?? pickedObj?.DateTime,
        exif?.OffsetTime ?? exifOffset,
        timeZone
      ),
      "hint",
      false
    )
  );

  list.push(
    buildFileLastModifiedCandidate(file)
  );

  return list.filter((c) => c.raw !== undefined || c.parsed !== undefined);
}

export async function extractDateCandidatesForFile(
  file: File,
  timeZone: TimeZoneSetting = "browser"
): Promise<DateCandidate[]> {
  const isJpeg = file.type === "image/jpeg" || /\.(jpe?g)$/i.test(file.name);
  if (isJpeg) return extractJpegDateCandidates(file, timeZone);

  const picked = await safeExifrParse(file, {
    pick: [
      "DateTimeOriginal",
      "CreateDate",
      "DateTimeDigitized",
      "ModifyDate",
      "DateTime",
      "OffsetTime",
      "OffsetTimeOriginal",
      "TimeZoneOffset",
      "MediaCreateDate",
      "TrackCreateDate",
      "CreationDate"
    ],
    translateKeys: true,
    translateValues: false,
    reviveValues: false,
    sanitize: true,
    mergeOutput: true,
    silentErrors: true,
    tiff: true,
    exif: true,
    gps: true,
    xmp: { parse: true },
    quicktime: true
  });

  const output = await safeExifrParse(file, {
    translateKeys: true,
    translateValues: false,
    reviveValues: false,
    mergeOutput: false,
    tiff: true,
    exif: true,
    gps: true,
    xmp: { parse: true },
    quicktime: true
  });
  if (!output && !picked) return [buildFileLastModifiedCandidate(file)];

  const ifd0 = output?.ifd0 ?? {};
  const exif = output?.exif ?? {};
  const gps = output?.gps ?? {};
  const xmp = output?.xmp ?? {};
  const quicktime = output?.quicktime ?? {};
  const pickedObj = picked ?? {};
  const exifOffset =
    exif?.OffsetTimeOriginal ??
    exif?.OffsetTime ??
    exif?.TimeZoneOffset ??
    pickedObj?.OffsetTimeOriginal ??
    pickedObj?.OffsetTime ??
    pickedObj?.TimeZoneOffset;

  const list: DateCandidate[] = [];
  list.push(
    candidate(
      "EXIF:DateTimeOriginal",
      exif?.DateTimeOriginal ?? (picked as any)?.DateTimeOriginal,
      parseExifDateWithOptionalOffset(
        exif?.DateTimeOriginal ?? pickedObj?.DateTimeOriginal,
        exif?.OffsetTimeOriginal ?? exifOffset,
        timeZone
      ),
      "high",
      true
    )
  );
  list.push(
    candidate(
      "EXIF:CreateDate",
      exif?.CreateDate ?? (picked as any)?.CreateDate,
      parseExifDateWithOptionalOffset(
        exif?.CreateDate ?? pickedObj?.CreateDate,
        exif?.OffsetTime ?? exifOffset,
        timeZone
      ),
      "medium",
      true
    )
  );
  list.push(
    candidate(
      "EXIF:DateTimeDigitized",
      exif?.DateTimeDigitized ?? (picked as any)?.DateTimeDigitized,
      parseExifDateWithOptionalOffset(
        exif?.DateTimeDigitized ?? pickedObj?.DateTimeDigitized,
        exif?.OffsetTime ?? exifOffset,
        timeZone
      ),
      "medium",
      true
    )
  );

  const xmpCreate = findXmpCreateDate(xmp);
  list.push(
    candidate("XMP:CreateDate", xmpCreate, parseCandidateDate(xmpCreate, timeZone), "medium", true)
  );

  const gpsParsed = gpsUtcDate(gps?.GPSDateStamp, gps?.GPSTimeStamp);
  const gpsRaw =
    gps?.GPSDateStamp && gps?.GPSTimeStamp
      ? `${toRawString(gps?.GPSDateStamp)} ${toRawString(gps?.GPSTimeStamp)}`
      : undefined;
  list.push(candidate("GPS:GPSDateStamp+GPSTimeStamp", gpsRaw, gpsParsed, "medium", true));

  list.push(
    candidate(
      "QuickTime:CreateDate",
      quicktime?.CreateDate,
      parseCandidateDate(quicktime?.CreateDate, timeZone),
      "medium",
      true
    )
  );
  list.push(
    candidate(
      "QuickTime:MediaCreateDate",
      quicktime?.MediaCreateDate,
      parseCandidateDate(quicktime?.MediaCreateDate, timeZone),
      "medium",
      true
    )
  );

  list.push(
    candidate(
      "EXIF:ModifyDate",
      exif?.ModifyDate ?? (picked as any)?.ModifyDate,
      parseExifDateWithOptionalOffset(
        exif?.ModifyDate ?? pickedObj?.ModifyDate,
        exif?.OffsetTime ?? exifOffset,
        timeZone
      ),
      "hint",
      false
    )
  );
  list.push(
    candidate(
      "EXIF:DateTime",
      ifd0?.DateTime ?? (picked as any)?.DateTime,
      parseExifDateWithOptionalOffset(
        ifd0?.DateTime ?? pickedObj?.DateTime,
        exif?.OffsetTime ?? exifOffset,
        timeZone
      ),
      "hint",
      false
    )
  );
  list.push(buildFileLastModifiedCandidate(file));
  return list.filter((c) => c.raw !== undefined || c.parsed !== undefined);
}
