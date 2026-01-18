export function isSupportedImageFile(file: File): boolean {
  if (file.type?.startsWith("image/")) return true;
  const name = file.name?.toLowerCase?.() ?? "";
  return /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/.test(name);
}
