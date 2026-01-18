type ScrollLockOptions = {
  allowScrollWithin?: Array<HTMLElement | null | undefined>;
};

type Snapshot = {
  scrollY: number;
  lockTarget: "body" | "html";
  lockTargetStyle: Partial<CSSStyleDeclaration>;
  bodyStyle: Partial<CSSStyleDeclaration>;
  htmlStyle: Partial<CSSStyleDeclaration>;
};

let nextLockId = 1;
let activeLocks = new Map<number, Set<HTMLElement>>();
let snapshot: Snapshot | null = null;
let cachedAllowedElements: HTMLElement[] = [];

let touchStartY = 0;

function isIOSLike(): boolean {
  const ua = navigator.userAgent ?? "";
  const platform = (navigator as any).platform ?? "";
  const touchPoints = (navigator as any).maxTouchPoints ?? 0;
  return /iP(hone|ad|od)/.test(ua) || (platform === "MacIntel" && touchPoints > 1);
}

function uniqAllowedElements(): HTMLElement[] {
  const uniq = new Set<HTMLElement>();
  for (const set of activeLocks.values()) {
    for (const el of set) {
      if (!el) continue;
      if (!document.contains(el)) continue;
      uniq.add(el);
    }
  }
  return Array.from(uniq);
}

function findAllowedScrollableTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Node)) return null;
  for (const allowed of cachedAllowedElements) {
    if (allowed.contains(target)) return allowed;
  }
  return null;
}

function isScrollable(el: HTMLElement): boolean {
  return el.scrollHeight > el.clientHeight;
}

function onTouchStart(e: TouchEvent) {
  touchStartY = e.touches[0]?.clientY ?? 0;
}

function onTouchMove(e: TouchEvent) {
  const touch = e.touches[0];
  if (!touch) return;

  const allowed = findAllowedScrollableTarget(e.target);
  if (!allowed) {
    e.preventDefault();
    return;
  }

  // Allowed region is permitted to handle touch gestures itself (e.g. crop canvas, date input).
  // We only intervene to stop scroll chaining / rubber-banding for scrollable regions.
  if (!isScrollable(allowed)) return;

  const deltaY = touch.clientY - touchStartY;
  const maxScrollTop = allowed.scrollHeight - allowed.clientHeight;
  const scrollTop = allowed.scrollTop;

  const atTop = scrollTop <= 0;
  const atBottom = scrollTop >= maxScrollTop;

  if ((atTop && deltaY > 0) || (atBottom && deltaY < 0)) {
    e.preventDefault();
  }
}

function applyLock() {
  if (snapshot) return;

  const body = document.body;
  const html = document.documentElement;
  const scrollingElement = (document.scrollingElement ?? html) as HTMLElement;
  const lockTarget: "body" | "html" = scrollingElement === body ? "body" : "html";
  const lockEl = lockTarget === "body" ? body : html;
  const scrollY = window.scrollY || window.pageYOffset || 0;

  snapshot = {
    scrollY,
    lockTarget,
    lockTargetStyle: {
      position: lockEl.style.position,
      top: lockEl.style.top,
      left: lockEl.style.left,
      right: lockEl.style.right,
      width: lockEl.style.width,
      overflow: lockEl.style.overflow
    },
    bodyStyle: {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow
    },
    htmlStyle: {
      position: html.style.position,
      top: html.style.top,
      left: html.style.left,
      right: html.style.right,
      width: html.style.width,
      overflow: html.style.overflow
    }
  };

  html.style.overflow = "hidden";

  if (isIOSLike()) {
    // iOS Safari: lock the actual scrolling element (body vs html varies by version),
    // and additionally prevent scroll chaining / rubber-banding outside allowed areas.
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";

    lockEl.style.position = "fixed";
    lockEl.style.top = `-${scrollY}px`;
    lockEl.style.left = "0";
    lockEl.style.right = "0";
    lockEl.style.width = "100%";
    lockEl.style.overflow = "hidden";

    document.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
    return;
  }

  body.style.overflow = "hidden";
}

function releaseLock() {
  if (!snapshot) return;

  const body = document.body;
  const html = document.documentElement;
  const lockEl = snapshot.lockTarget === "body" ? body : html;

  html.style.position = snapshot.htmlStyle.position ?? "";
  html.style.top = snapshot.htmlStyle.top ?? "";
  html.style.left = snapshot.htmlStyle.left ?? "";
  html.style.right = snapshot.htmlStyle.right ?? "";
  html.style.width = snapshot.htmlStyle.width ?? "";
  html.style.overflow = snapshot.htmlStyle.overflow ?? "";

  body.style.position = snapshot.bodyStyle.position ?? "";
  body.style.top = snapshot.bodyStyle.top ?? "";
  body.style.left = snapshot.bodyStyle.left ?? "";
  body.style.right = snapshot.bodyStyle.right ?? "";
  body.style.width = snapshot.bodyStyle.width ?? "";
  body.style.overflow = snapshot.bodyStyle.overflow ?? "";

  lockEl.style.position = snapshot.lockTargetStyle.position ?? "";
  lockEl.style.top = snapshot.lockTargetStyle.top ?? "";
  lockEl.style.left = snapshot.lockTargetStyle.left ?? "";
  lockEl.style.right = snapshot.lockTargetStyle.right ?? "";
  lockEl.style.width = snapshot.lockTargetStyle.width ?? "";
  lockEl.style.overflow = snapshot.lockTargetStyle.overflow ?? "";

  if (isIOSLike()) {
    document.removeEventListener("touchstart", onTouchStart, true);
    document.removeEventListener("touchmove", onTouchMove, true);
  }

  const restoreY = snapshot.scrollY;
  snapshot = null;
  cachedAllowedElements = [];

  window.scrollTo(0, restoreY);
}

export function lockScroll(options: ScrollLockOptions = {}): () => void {
  const id = nextLockId++;
  const allow = (options.allowScrollWithin ?? []).filter(Boolean) as HTMLElement[];
  activeLocks.set(id, new Set(allow));

  cachedAllowedElements = uniqAllowedElements();
  if (activeLocks.size === 1) applyLock();

  return () => {
    if (!activeLocks.has(id)) return;
    activeLocks.delete(id);
    cachedAllowedElements = uniqAllowedElements();
    if (activeLocks.size === 0) releaseLock();
  };
}
