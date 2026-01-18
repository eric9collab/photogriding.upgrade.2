import { parseLocalDateTime } from "../utils/date";
import { lockScroll } from "../utils/scroll-lock";

export type DateEditorController = {
  open: (initial?: Date) => Promise<Date | null>;
  close: () => void;
  isOpen: () => boolean;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function mountDateEditor(): DateEditorController {
  const modal = document.querySelector<HTMLElement>("[data-modal]");
  const modalDate = modal?.querySelector<HTMLInputElement>("[data-date]") ?? null;
  const modalTime = modal?.querySelector<HTMLInputElement>("[data-time]") ?? null;
  const modalSave = modal?.querySelector<HTMLButtonElement>("[data-save]") ?? null;
  const modalCancel = modal?.querySelector<HTMLButtonElement>("[data-cancel]") ?? null;

  if (!modal || !modalDate || !modalTime || !modalSave || !modalCancel) {
    return {
      open: async () => null,
      close: () => {},
      isOpen: () => false
    };
  }

  let resolver: ((value: Date | null) => void) | null = null;
  let unlockScroll: (() => void) | null = null;

  function closeWith(value: Date | null) {
    if (resolver) resolver(value);
    resolver = null;
    unlockScroll?.();
    unlockScroll = null;
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    modal.setAttribute("aria-hidden", "true");
  }

  modalCancel.addEventListener("click", () => closeWith(null));
  modalSave.addEventListener("click", () => {
    if (!resolver) return;
    if (!modalDate.value) {
      modalDate.reportValidity();
      modalDate.focus();
      return;
    }
    const nextDate = parseLocalDateTime(modalDate.value, modalTime.value || undefined);
    if (!nextDate) {
      modalDate.setCustomValidity("日期格式不正確");
      modalDate.reportValidity();
      modalDate.setCustomValidity("");
      modalDate.focus();
      return;
    }
    closeWith(nextDate);
  });
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeWith(null);
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && resolver) closeWith(null);
  });

  return {
    async open(initial?: Date) {
      if (resolver) closeWith(null);

      if (initial) {
        modalDate.value = `${initial.getFullYear()}-${pad2(initial.getMonth() + 1)}-${pad2(
          initial.getDate()
        )}`;
        const hh = pad2(initial.getHours());
        const mm = pad2(initial.getMinutes());
        modalTime.value = `${hh}:${mm}`;
      } else {
        modalDate.value = "";
        modalTime.value = "";
      }

      modal.classList.remove("hidden");
      modal.classList.add("flex");
      modal.setAttribute("aria-hidden", "false");
      unlockScroll?.();
      unlockScroll = lockScroll({ allowScrollWithin: [modal] });
      setTimeout(() => modalDate.focus(), 0);

      return await new Promise<Date | null>((resolve) => {
        resolver = resolve;
      });
    },
    close() {
      if (resolver) closeWith(null);
    },
    isOpen() {
      return Boolean(resolver);
    }
  };
}
