export async function loadBitmap(
  file: File,
  opts?: { maxSide?: number }
): Promise<ImageBitmap | null> {
  try {
    if (typeof createImageBitmap !== "function") return null;
    const maxSide = opts?.maxSide;
    const original = await createImageBitmap(file);
    if (!(Number.isFinite(maxSide) && (maxSide as number) > 0)) return original;

    const max = maxSide as number;
    const w = original.width;
    const h = original.height;
    if (!(w > 0 && h > 0)) return original;
    if (Math.max(w, h) <= max) return original;

    const ratio = w >= h ? max / w : max / h;
    const rw = Math.max(1, Math.round(w * ratio));
    const rh = Math.max(1, Math.round(h * ratio));
    try {
      // Use resized decode to reduce memory on mobile. Browsers may ignore unsupported options.
      const resized = await createImageBitmap(file, {
        resizeWidth: rw,
        resizeHeight: rh,
        resizeQuality: "high"
      } as unknown as ImageBitmapOptions);
      original.close();
      return resized;
    } catch {
      return original;
    }
  } catch {
    return null;
  }
}

export async function decodeImageElement(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = "async";
  img.loading = "eager";
  img.src = url;
  if ("decode" in img) {
    try {
      await img.decode();
    } catch {
      // ignore
    }
  }
  return img;
}

export async function readImageSize(
  file: File,
  url: string
): Promise<{ width: number; height: number } | null> {
  const bitmap = await loadBitmap(file);
  if (bitmap) {
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  }
  const img = await decodeImageElement(url);
  if (img.naturalWidth > 0 && img.naturalHeight > 0)
    return { width: img.naturalWidth, height: img.naturalHeight };
  return null;
}
