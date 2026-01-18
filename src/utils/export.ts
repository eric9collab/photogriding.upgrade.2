import type { PhotoItem } from "../lib/photo-item";
import type { SortDirection } from "./sort";
import { formatDateLabel, isLowConfidenceDateSource } from "./date";
import { drawSquareToContext, isSquareLike } from "./crop";
import { comparePhotoItems } from "./sort";
import { loadBitmap } from "./image";
import { createObjectURL, revokeObjectURL } from "./object-url";
import type { TimeZoneSetting } from "./timezone";
import { chunkTimelineRows, TIMELINE_MAX_PER_ROW, toRomanNumeral } from "./timeline";
import { GRID_DATE_BADGE } from "./grid-date-badge";

type ExportFormat = "png" | "jpg";
type PreviewMode = "grid" | "timeline";

// Centralized export quality settings (do not expose in UI).
export const EXPORT_SCALE = 3; // high-resolution render ratio
export const JPG_QUALITY = 0.98; // "near-lossless" high quality
export const MAX_EXPORT_CANVAS_HEIGHT = 16_384; // conservative browser canvas limit
export type ExportOptions = {
  format: ExportFormat;
  previewMode: PreviewMode;
  previewColumns: number;
  sortDirection: SortDirection;
  showDates: boolean;
  timeZone: TimeZoneSetting;
  maxGridRowsPerPage?: number;
  maxTimelineItemsPerPage?: number;
};

async function downloadBlob(blob: Blob, filename: string) {
  const url = createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => revokeObjectURL(url), 10_000);
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function measureTabularWidth(ctx: CanvasRenderingContext2D, text: string): number {
  // Canvas has no reliable font-variant-numeric control, so emulate tabular digits by using a fixed digit advance.
  const digitW = Math.max(...Array.from({ length: 10 }, (_, d) => ctx.measureText(String(d)).width));
  let w = 0;
  for (const ch of text) {
    if (ch >= "0" && ch <= "9") w += digitW;
    else w += ctx.measureText(ch).width;
  }
  return w;
}

function fillTabularText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  const digitW = Math.max(...Array.from({ length: 10 }, (_, d) => ctx.measureText(String(d)).width));
  let cursor = x;
  for (const ch of text) {
    ctx.fillText(ch, cursor, y);
    cursor += ch >= "0" && ch <= "9" ? digitW : ctx.measureText(ch).width;
  }
}

function drawGridDateBadge(
  ctx: CanvasRenderingContext2D,
  text: string,
  tileX: number,
  tileY: number,
  tileSize: number,
  scale: number
) {
  const padX = GRID_DATE_BADGE.padX * scale;
  const padY = GRID_DATE_BADGE.padY * scale;
  const margin = GRID_DATE_BADGE.marginPx * scale;

  ctx.font = `${GRID_DATE_BADGE.fontWeight} ${GRID_DATE_BADGE.fontSize * scale}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
  const w = measureTabularWidth(ctx, text) + padX * 2;
  const h = GRID_DATE_BADGE.height * scale;

  const right = tileX + tileSize - margin;
  const bottom = tileY + tileSize - margin;
  const x = right - w;
  const y = bottom - h;
  const r = GRID_DATE_BADGE.radius * scale;

  ctx.fillStyle = GRID_DATE_BADGE.bg;
  ctx.strokeStyle = GRID_DATE_BADGE.stroke;
  ctx.lineWidth = GRID_DATE_BADGE.lineWidth * scale;
  roundedRectPath(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = GRID_DATE_BADGE.text;
  fillTabularText(ctx, text, x + padX, y + h - padY);
}

function drawNodeDateLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  xPreferredLeft: number,
  maxRight: number,
  yCenter: number,
  scale: number
): { x: number; y: number; w: number; h: number } {
  // Per requirements: Timeline node dates must be CLEAR and NOT TOO FAINT (matching text-lg font-semibold).
  const padX = 14 * scale;
  const padY = 11 * scale;
  ctx.font = `600 ${18 * scale}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
  const w = measureTabularWidth(ctx, text) + padX * 2;
  const h = 36 * scale;
  const r = 10 * scale;

  const x = Math.max(0, Math.min(xPreferredLeft, maxRight - w));
  const y = yCenter - h / 2;

  ctx.fillStyle = "rgba(0,0,0,0.70)";
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 1 * scale;
  roundedRectPath(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(244,244,245,0.98)";
  fillTabularText(ctx, text, x + padX, y + h - padY);

  return { x, y, w, h };
}

function drawWarnMark(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  const r = 9 * scale;
  ctx.fillStyle = "rgba(245,158,11,0.18)";
  ctx.strokeStyle = "rgba(251,191,36,0.25)";
  ctx.lineWidth = 1 * scale;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(253,230,138,0.95)";
  ctx.font = `${12 * scale}px ui-sans-serif, system-ui, -apple-system`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("!", x, y + 1 * scale);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angleRad: number,
  size: number,
  scale: number
) {
  const a = size * scale;
  const left = angleRad - Math.PI / 6;
  const right = angleRad + Math.PI / 6;
  ctx.save();
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - Math.cos(left) * a, y - Math.sin(left) * a);
  ctx.moveTo(x, y);
  ctx.lineTo(x - Math.cos(right) * a, y - Math.sin(right) * a);
  ctx.stroke();
  ctx.restore();
}

function drawTimelineRail(
  ctx: CanvasRenderingContext2D,
  x: number,
  top: number,
  bottom: number,
  scale: number
) {
  ctx.save();
  // Guide rail only: subtle background alignment, never competes with date labels.
  ctx.strokeStyle = "rgba(244,244,245,0.16)";
  ctx.lineWidth = 4 * scale;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.lineTo(x, bottom);
  ctx.stroke();
  ctx.restore();
}

function drawSectionLabel(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, scale: number) {
  if (!label) return;
  ctx.save();
  const padX = 10 * scale;
  const padY = 6 * scale;
  const fontSize = 13 * scale;
  ctx.font = `500 ${fontSize}px ui-sans-serif, system-ui, -apple-system`;
  const textW = ctx.measureText(label).width;
  const w = textW + padX * 2;
  const h = fontSize + padY * 2;
  const r = h / 2;
  const bx = x - w / 2;
  const by = y - h / 2;

  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 1 * scale;
  roundedRectPath(ctx, bx, by, w, h, r);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(244,244,245,0.78)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x, y);
  ctx.restore();
}

function canvasToBlob(canvas: HTMLCanvasElement, format: ExportFormat): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    const type = format === "png" ? "image/png" : "image/jpeg";
    const quality = format === "jpg" ? JPG_QUALITY : undefined;
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), type, quality);
  });
}

export async function exportCollage(items: PhotoItem[], options: ExportOptions) {
  const exportItems = [...items].sort((a, b) =>
    comparePhotoItems(a, b, options.sortDirection, options.timeZone)
  );
  if (exportItems.length === 0) return;

  const scale = EXPORT_SCALE;
  const tile = 512 * scale;
  const gap = 16 * scale;
  const pad = 24 * scale;
  const bg = "#09090b";

  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

  if (options.previewMode === "grid") {
    const cols = Math.min(6, Math.max(2, options.previewColumns));
    const rowsPerPage = options.maxGridRowsPerPage ?? 10;
    const maxItemsPerPage = cols * rowsPerPage;
    let page = 1;

    for (let start = 0; start < exportItems.length; start += maxItemsPerPage) {
      const pageItems = exportItems.slice(start, start + maxItemsPerPage);
      const rows = Math.ceil(pageItems.length / cols);
      const width = pad * 2 + cols * tile + (cols - 1) * gap;
      const height = pad * 2 + rows * tile + (rows - 1) * gap;

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      for (let i = 0; i < pageItems.length; i += 1) {
        const item = pageItems[i];
        const r = Math.floor(i / cols);
        const c = i % cols;
        const x = pad + c * (tile + gap);
        const y = pad + r * (tile + gap);

        const bitmap = await loadBitmap(item.file);
        if (!bitmap) continue;
        const mode = item.cropIsManual ? "cover" : isSquareLike(bitmap.width, bitmap.height) ? "contain" : item.cropMode;
        drawSquareToContext(ctx, bitmap, item.crop, mode, bitmap.width, bitmap.height, x, y, tile);
        bitmap.close();

        if (options.showDates) {
          const labelText = formatDateLabel(item.effectiveDate, "fixed", options.timeZone);
          drawGridDateBadge(ctx, labelText, x, y, tile, scale);
          if (isLowConfidenceDateSource(item.dateSource))
            drawWarnMark(ctx, x + tile - 12 * scale, y + tile - 36 * scale, scale);
        }
      }

      const blob = await canvasToBlob(canvas, options.format);
      const suffix = exportItems.length > maxItemsPerPage ? `-p${page}` : "";
      await downloadBlob(blob, `photogriding-grid${suffix}-${timestamp}.${options.format}`);
      page += 1;
    }
    return;
  }

  // timeline (row-based, max 3 photos per row)
  const rows = chunkTimelineRows(exportItems, TIMELINE_MAX_PER_ROW);

  const tPad = 32 * scale;
  const rowGap = 40 * scale;
  const colGap = 32 * scale;
  const railColW = 64 * scale;
  const nodeBandH = 64 * scale;
  const rowH = nodeBandH + tile;

  const maxRowsPerPage = Math.max(
    1,
    Math.floor((MAX_EXPORT_CANVAS_HEIGHT - tPad * 2 + rowGap) / (rowH + rowGap))
  );

  let page = 1;
  for (let rowStart = 0; rowStart < rows.length; rowStart += maxRowsPerPage) {
    const pageRows = rows.slice(rowStart, rowStart + maxRowsPerPage);
    const pageRowCount = pageRows.length;
    const maxCols = Math.max(...pageRows.map((r) => r.length), 1);

    const width =
      tPad * 2 +
      railColW +
      maxCols * tile +
      Math.max(0, maxCols - 1) * colGap;
    const height = tPad * 2 + pageRowCount * rowH + Math.max(0, pageRowCount - 1) * rowGap;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const drawRow = async (rowItems: PhotoItem[], rowIndexInPage: number) => {
      const rowTop = tPad + rowIndexInPage * (rowH + rowGap);
      const nodeY = rowTop + nodeBandH / 2;
      const tileTop = rowTop + nodeBandH;

      const xBase = tPad;
      const xRail = xBase + railColW / 2;
      drawTimelineRail(ctx, xRail, rowTop, rowTop + rowH, scale);
      drawSectionLabel(ctx, toRomanNumeral(rowStart + rowIndexInPage + 1), xRail, rowTop + 16 * scale, scale);

      const nodeXs: number[] = [];
      const tileXs: number[] = [];
      for (let i = 0; i < rowItems.length; i += 1) {
        const tileX = xBase + railColW + i * (tile + colGap);
        tileXs.push(tileX);
        nodeXs.push(tileX + 24 * scale);
      }

      // Connect from row rail to first node.
      if (nodeXs.length > 0) {
        ctx.save();
        ctx.strokeStyle = "rgba(244,244,245,0.18)";
        ctx.lineWidth = 4 * scale;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(xRail, nodeY);
        ctx.lineTo(nodeXs[0] - 12 * scale, nodeY);
        ctx.stroke();
        ctx.restore();
      }

      // Nodes, labels, photos, and in-row arrows 1→2→3.
      for (let i = 0; i < rowItems.length; i += 1) {
        const item = rowItems[i];
        const nodeX = nodeXs[i];
        const tileX = tileXs[i];

        // Node
        ctx.save();
        ctx.strokeStyle = "rgba(244,244,245,0.55)";
        ctx.lineWidth = 4 * scale;
        ctx.beginPath();
        ctx.arc(nodeX, nodeY, 6 * scale, 0, Math.PI * 2);
        if (i === 0) {
          // Start-of-row marker: non-text, minimal fill.
          ctx.fillStyle = "rgba(244,244,245,0.14)";
          ctx.fill();
        }
        ctx.stroke();
        ctx.restore();

        // Arrow to next node (kept in the node band, never over the photo).
        if (i < rowItems.length - 1) {
          const nextX = nodeXs[i + 1];
          ctx.save();
          ctx.strokeStyle = "rgba(244,244,245,0.42)";
          ctx.lineWidth = 5 * scale;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(nodeX + 10 * scale, nodeY);
          ctx.lineTo(nextX - 12 * scale, nodeY);
          ctx.stroke();
          drawArrowHead(ctx, nextX - 12 * scale, nodeY, 0, 10, scale);
          ctx.restore();
        }

        // Photo
        const bitmap = await loadBitmap(item.file);
        if (bitmap) {
          drawSquareToContext(
            ctx,
            bitmap,
            item.crop,
            item.cropIsManual ? "cover" : isSquareLike(bitmap.width, bitmap.height) ? "contain" : item.cropMode,
            bitmap.width,
            bitmap.height,
            tileX,
            tileTop,
            tile
          );
          bitmap.close();
        }

        if (options.showDates) {
          // Date label (node only, export must be pure date string)
          const dayLabel = formatDateLabel(item.effectiveDate, "fixed", options.timeZone);
          const bounds = drawNodeDateLabel(
            ctx,
            dayLabel,
            nodeX + 16 * scale,
            tileX + tile - 16 * scale,
            nodeY,
            scale
          );
          if (isLowConfidenceDateSource(item.dateSource)) {
            // Confidence hint must be non-text in final export.
            ctx.save();
            ctx.fillStyle = "rgba(253,230,138,0.95)";
            ctx.strokeStyle = "rgba(251,191,36,0.30)";
            ctx.lineWidth = 1 * scale;
            const cx = bounds.x + bounds.w - 10 * scale;
            const cy = bounds.y + 10 * scale;
            ctx.beginPath();
            ctx.arc(cx, cy, 4 * scale, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }
        }
      }

    };

    for (let r = 0; r < pageRows.length; r += 1) {
      await drawRow(pageRows[r], r);
    }

    const blob = await canvasToBlob(canvas, options.format);
    const suffix = rows.length > pageRows.length || page > 1 ? `-p${page}` : "";
    await downloadBlob(blob, `photogriding-timeline${suffix}-${timestamp}.${options.format}`);
    page += 1;
  }
}
