import type { PhotoItem } from "../lib/photo-item";
import { formatDateLabel, isLowConfidenceDateSource } from "../utils/date";
import type { TimeZoneSetting } from "../utils/timezone";
import { dayKey } from "../utils/sort";

export type PhotoCardActions = {
  onSelect: (id: string) => void;
  onMenuToggle: (id: string) => void;
  onMenuAction: (action: "edit-date" | "crop" | "replace" | "remove" | "insert-before" | "insert-after", id: string) => void;
};

export type PhotoCardProps = {
  item: PhotoItem;
  selectedId: string | null;
  openMenuId: string | null;
  timeZone: TimeZoneSetting;
  showDates: boolean;
  isMobile: boolean;
};

export function createPhotoCard(props: PhotoCardProps, actions: PhotoCardActions): HTMLElement {
  const { item, selectedId, openMenuId, timeZone, showDates, isMobile } = props;

  const card = document.createElement("button");
  card.type = "button";
  card.draggable = true;
  card.className =
    "group relative aspect-square overflow-hidden rounded-lg bg-zinc-900 ring-1 ring-white/10 transition hover:ring-white/20";
  card.dataset.card = "true";
  card.dataset.id = item.id;
  card.dataset.group = dayKey(item.effectiveDate, timeZone);
  card.classList.toggle("ring-white/35", selectedId === item.id);
  card.classList.toggle("outline-none", true);
  card.addEventListener("click", (e) => {
    const target = e.target as Element | null;
    if (target?.closest?.("[data-menu-root]")) return;
    actions.onSelect(item.id);
  });

  const skeleton = document.createElement("div");
  skeleton.className = "absolute inset-0 animate-pulse bg-zinc-800/60";
  card.appendChild(skeleton);

  if (item.thumbUrl) {
    const img = document.createElement("img");
    img.decoding = "async";
    img.loading = "lazy";
    img.src = item.thumbUrl;
    img.alt = "";
    img.className = "absolute inset-0 h-full w-full object-cover";
    img.addEventListener("load", () => skeleton.remove(), { once: true });
    img.addEventListener("error", () => {}, { once: true });
    card.appendChild(img);
  }

  const topBar = document.createElement("div");
  topBar.className = "pointer-events-none absolute inset-x-0 top-0 flex items-start justify-end p-2";

  const menuRoot = document.createElement("div");
  menuRoot.dataset.menuRoot = "true";
  menuRoot.className = "pointer-events-auto relative";

  const menuButton = document.createElement("button");
  menuButton.type = "button";
  menuButton.dataset.menuButton = "true";
  menuButton.className =
    "inline-flex h-10 w-10 items-center justify-center rounded-lg bg-black/45 text-base font-semibold text-zinc-100 ring-1 ring-white/10 transition hover:bg-black/55 md:h-7 md:w-7 md:rounded md:text-sm";
  menuButton.textContent = "⋯";
  menuButton.addEventListener("click", (e) => {
    e.stopPropagation();
    if (isMobile) actions.onSelect(item.id);
    else actions.onMenuToggle(item.id);
  });
  menuRoot.appendChild(menuButton);

  const menu = document.createElement("div");
  menu.className =
    "absolute right-0 mt-2 w-44 overflow-hidden rounded-md bg-zinc-950 shadow-panel ring-1 ring-white/10";
  menu.classList.toggle("hidden", isMobile || openMenuId !== item.id);

  const makeAction = (label: string, action: Parameters<PhotoCardActions["onMenuAction"]>[0]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "block w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-white/5";
    b.textContent = label;
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      actions.onMenuAction(action, item.id);
    });
    return b;
  };

  menu.appendChild(makeAction("編輯日期", "edit-date"));
  menu.appendChild(makeAction("裁切", "crop"));
  menu.appendChild(document.createElement("div")).className = "h-px bg-white/10";
  menu.appendChild(makeAction("替換這張", "replace"));
  menu.appendChild(makeAction("移除這張", "remove"));
  menu.appendChild(document.createElement("div")).className = "h-px bg-white/10";
  menu.appendChild(makeAction("在前面插入照片", "insert-before"));
  menu.appendChild(makeAction("在後面插入照片", "insert-after"));
  menuRoot.appendChild(menu);

  topBar.appendChild(menuRoot);
  card.appendChild(topBar);

  const meta = document.createElement("div");
  meta.className = "absolute inset-x-0 bottom-0 p-2";

  if (showDates) {
    const dateLabel = document.createElement("div");
    dateLabel.className =
      "ml-auto inline-flex items-center rounded-md bg-black/55 px-2 py-1 text-[11px] font-semibold leading-none tabular-nums text-zinc-50 ring-1 ring-white/10 md:px-2.5 md:py-1.5 md:text-xs md:font-medium";
    dateLabel.textContent = formatDateLabel(item.effectiveDate, "fixed", timeZone);
    meta.appendChild(dateLabel);
  }

  if (isLowConfidenceDateSource(item.dateSource)) {
    const warn = document.createElement("div");
    warn.className =
      "absolute left-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/15 text-[11px] font-bold text-amber-200 ring-1 ring-amber-400/25";
    warn.title = "日期可信度較低（可能是匯出/複製時間），建議確認";
    warn.textContent = "!";
    card.appendChild(warn);
  }

  if (typeof item.autoCropConfidence === "number" && item.autoCropConfidence < 0.35) {
    const hint = document.createElement("div");
    hint.className =
      "absolute left-2 bottom-2 inline-flex items-center rounded bg-amber-500/15 px-2 py-1 text-[11px] font-medium text-amber-200 ring-1 ring-amber-400/25";
    hint.textContent = "建議檢查裁切";
    card.appendChild(hint);
  }

  card.appendChild(meta);

  return card;
}
