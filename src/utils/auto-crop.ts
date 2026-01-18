import type { PhotoItem } from "../lib/photo-item";
import { geometricCenterCrop, isSquareLike } from "./crop";
import { readImageSize } from "./image";

export async function computeAutoCropForFile(
  file: File,
  url: string
): Promise<{ crop: PhotoItem["crop"]; confidence: number; mode: PhotoItem["cropMode"]; sourceWidth: number; sourceHeight: number } | null> {
  const size = await readImageSize(file, url);
  if (!size) return null;

  // Requirements:
  // - If the image is already ~1:1, do NOT crop any pixels (use "contain").
  // - Otherwise use centered square crop ("cover") as default.
  const mode: PhotoItem["cropMode"] = isSquareLike(size.width, size.height) ? "contain" : "cover";
  return { crop: geometricCenterCrop(size.width, size.height), confidence: 1, mode, sourceWidth: size.width, sourceHeight: size.height };
}
