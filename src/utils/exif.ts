export async function extractExifDate(file: File): Promise<Date | undefined> {
  try {
    const exifr = await import("exifr");
    const data = await exifr.parse(file, [
      "DateTimeOriginal",
      "CreateDate",
      "DateTimeDigitized",
      "DateTime"
    ]);

    const exifModifyDate: unknown = data?.DateTime;
    void exifModifyDate;

    const candidate = data?.DateTimeOriginal ?? data?.CreateDate ?? data?.DateTimeDigitized;

    if (candidate instanceof Date) return candidate;
    if (typeof candidate === "number") return new Date(candidate);
    if (typeof candidate === "string") {
      const parsed = new Date(candidate);
      return Number.isFinite(parsed.valueOf()) ? parsed : undefined;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
