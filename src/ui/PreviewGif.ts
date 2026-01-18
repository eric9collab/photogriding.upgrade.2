import type { PhotoItem } from "../lib/photo-item";
import { formatDateLabel } from "../utils/date";
import type { TimeZoneSetting } from "../utils/timezone";
import { GRID_DATE_BADGE } from "../utils/grid-date-badge";

type PreviewGifOptions = {
  timeZone: TimeZoneSetting;
  showDates: boolean;
  delayMs: number;
  loop: boolean;
};

type PreviewGifHandle = {
  cleanup: () => void;
};

function clampDelayMs(ms: number): number {
  if (!Number.isFinite(ms)) return 1000;
  return Math.max(50, Math.min(10_000, Math.round(ms)));
}

export function renderPreviewGif(
  root: HTMLElement,
  items: PhotoItem[],
  opts: PreviewGifOptions
): PreviewGifHandle {
  root.textContent = "";
  root.className = "grid gap-3";

  const delayMs = clampDelayMs(opts.delayMs);

  const wrap = document.createElement("div");
  wrap.className = "grid gap-3";

  const stage = document.createElement("div");
  stage.className = "relative mx-auto w-full max-w-[560px] overflow-hidden rounded-panel bg-zinc-900/40 ring-1 ring-white/10";
  wrap.appendChild(stage);

  const img = document.createElement("img");
  img.decoding = "async";
  img.loading = "eager";
  img.alt = "";
  img.className = "block aspect-square h-auto w-full object-cover";
  stage.appendChild(img);

  const skeleton = document.createElement("div");
  skeleton.className = "absolute inset-0 animate-pulse bg-zinc-800/50";
  stage.appendChild(skeleton);

  const dateBadge = document.createElement("div");
  dateBadge.className = GRID_DATE_BADGE.domClass;
  dateBadge.classList.add("pointer-events-none");
  dateBadge.classList.toggle("hidden", !opts.showDates);
  stage.appendChild(dateBadge);

  const controls = document.createElement("div");
  controls.className = "flex items-center justify-between gap-3";
  wrap.appendChild(controls);

  const left = document.createElement("div");
  left.className = "flex items-center gap-2";
  controls.appendChild(left);

  const playBtn = document.createElement("button");
  playBtn.type = "button";
  playBtn.className =
    "rounded-md bg-white/10 px-3 py-2 text-xs font-semibold text-zinc-50 ring-1 ring-white/15 hover:bg-white/15";
  playBtn.textContent = "Pause";
  left.appendChild(playBtn);

  const progress = document.createElement("div");
  progress.className = "text-xs font-medium text-zinc-300 tabular-nums";
  left.appendChild(progress);

  const hint = document.createElement("div");
  hint.className = "text-[11px] text-zinc-400";
  hint.textContent = `每張 ${Math.round(delayMs / 100) / 10}s`;
  controls.appendChild(hint);

  if (items.length === 0) {
    progress.textContent = "0/0";
    playBtn.disabled = true;
    playBtn.classList.add("opacity-60", "cursor-not-allowed");
    skeleton.remove();
    root.appendChild(wrap);
    return { cleanup: () => {} };
  }

  let playing = true;
  let frameIndex = 0;
  let timer: number | null = null;
  let disposed = false;

  async function drawFrame(index: number) {
    const item = items[index];
    if (!item) return;

    if (item.thumbUrl) {
      img.src = item.thumbUrl;
      skeleton.remove();
    }

    if (opts.showDates) {
      dateBadge.textContent = formatDateLabel(item.effectiveDate, "fixed", opts.timeZone);
      dateBadge.classList.remove("hidden");
    } else {
      dateBadge.textContent = "";
      dateBadge.classList.add("hidden");
    }

    progress.textContent = `${index + 1}/${items.length}`;
  }

  function clearTimer() {
    if (timer) window.clearTimeout(timer);
    timer = null;
  }

  async function tick() {
    if (disposed || !playing) return;
    await drawFrame(frameIndex);
    if (disposed || !playing) return;

    timer = window.setTimeout(async () => {
      if (disposed || !playing) return;
      const next = frameIndex + 1;
      if (next >= items.length) {
        if (!opts.loop) {
          playing = false;
          playBtn.textContent = "Play";
          clearTimer();
          return;
        }
        frameIndex = 0;
      } else {
        frameIndex = next;
      }
      void tick();
    }, delayMs);
  }

  playBtn.addEventListener("click", () => {
    playing = !playing;
    playBtn.textContent = playing ? "Pause" : "Play";
    if (playing) void tick();
    else clearTimer();
  });

  root.appendChild(wrap);
  void tick();

  return {
    cleanup: () => {
      disposed = true;
      clearTimer();
    }
  };
}
