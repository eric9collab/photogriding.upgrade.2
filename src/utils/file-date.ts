export function fallbackDateFromFile(file: File): Date | undefined {
  if (Number.isFinite(file.lastModified)) return new Date(file.lastModified);
  const legacy = (file as any)?.lastModifiedDate;
  if (legacy instanceof Date && Number.isFinite(legacy.valueOf())) return legacy;
  return undefined;
}
