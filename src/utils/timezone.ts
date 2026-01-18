export type TimeZoneSetting = "browser" | "Asia/Taipei";

export function resolveTimeZone(setting: TimeZoneSetting): string | undefined {
  return setting === "browser" ? undefined : setting;
}

function partsToNumber(parts: Intl.DateTimeFormatPart[], type: string): number {
  const value = parts.find((p) => p.type === type)?.value;
  const n = value ? Number(value) : NaN;
  return Number.isFinite(n) ? n : NaN;
}

export function getCalendarPartsInTimeZone(
  date: Date,
  setting: TimeZoneSetting
): { year: number; month: number; day: number } {
  const timeZone = resolveTimeZone(setting);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = fmt.formatToParts(date);
  return {
    year: partsToNumber(parts, "year"),
    month: partsToNumber(parts, "month"),
    day: partsToNumber(parts, "day")
  };
}

export function getLocalCalendarKey(date: Date | undefined, setting: TimeZoneSetting): string {
  if (!date) return "unknown";
  const { year, month, day } = getCalendarPartsInTimeZone(date, setting);
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function getTimePartsInTimeZone(
  date: Date,
  timeZone: string
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const parts = fmt.formatToParts(date);
  return {
    year: partsToNumber(parts, "year"),
    month: partsToNumber(parts, "month"),
    day: partsToNumber(parts, "day"),
    hour: partsToNumber(parts, "hour"),
    minute: partsToNumber(parts, "minute"),
    second: partsToNumber(parts, "second")
  };
}

function tzOffsetMs(utcMs: number, timeZone: string): number {
  const utcDate = new Date(utcMs);
  const p = getTimePartsInTimeZone(utcDate, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, 0);
  return asIfUtc - utcMs;
}

export function zonedLocalToInstant(
  parts: { year: number; month: number; day: number; hour?: number; minute?: number; second?: number },
  setting: TimeZoneSetting
): Date | undefined {
  const { year, month, day } = parts;
  const hour = parts.hour ?? 0;
  const minute = parts.minute ?? 0;
  const second = parts.second ?? 0;

  if (![year, month, day, hour, minute, second].every((n) => Number.isFinite(n))) return undefined;

  if (setting === "browser") {
    const dt = new Date(year, month - 1, day, hour, minute, second, 0);
    return Number.isFinite(dt.valueOf()) ? dt : undefined;
  }

  const timeZone = resolveTimeZone(setting);
  if (!timeZone) return undefined;

  // Convert "local time in target timeZone" into an instant.
  // Iteratively adjust using the zone offset at the guessed instant.
  let utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  let offset = tzOffsetMs(utcGuess, timeZone);
  let utc = utcGuess - offset;
  const offset2 = tzOffsetMs(utc, timeZone);
  if (offset2 !== offset) utc = utcGuess - offset2;
  const dt = new Date(utc);
  return Number.isFinite(dt.valueOf()) ? dt : undefined;
}

export function shiftZonedCalendarDayKeepingTime(
  date: Date,
  deltaDays: number,
  setting: TimeZoneSetting
): Date | undefined {
  if (!Number.isFinite(deltaDays) || deltaDays === 0) return date;
  const tz = resolveTimeZone(setting);
  if (!tz) {
    const shifted = new Date(date);
    shifted.setDate(shifted.getDate() + deltaDays);
    return Number.isFinite(shifted.valueOf()) ? shifted : undefined;
  }

  const p = getTimePartsInTimeZone(date, tz);
  const baseUtc = Date.UTC(p.year, p.month - 1, p.day, 0, 0, 0, 0);
  const nextUtc = baseUtc + deltaDays * 86_400_000;
  const nextDateAtNoonUtc = new Date(nextUtc + 12 * 60 * 60_000);
  const nextParts = getTimePartsInTimeZone(nextDateAtNoonUtc, tz);

  return zonedLocalToInstant(
    { year: nextParts.year, month: nextParts.month, day: nextParts.day, hour: p.hour, minute: p.minute, second: p.second },
    setting
  );
}
