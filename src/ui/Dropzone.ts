import { isSupportedImageFile } from "../utils/file";

export type DropzoneBindings = {
  onFiles: (files: File[]) => void;
  onClearAll: () => void;
};

export type DropzoneController = {
  setHasItems: (hasItems: boolean) => void;
  setStatus: (text: string) => void;
};

function setDropzoneActive(dropzone: HTMLElement, active: boolean) {
  dropzone.classList.toggle("border-white/35", active);
  dropzone.classList.toggle("bg-white/5", active);
}

function collectDropFiles(dt: DataTransfer): File[] {
  const files = Array.from(dt.files ?? []);
  if (files.length > 0) return files;
  if (!dt.items?.length) return [];
  return Array.from(dt.items)
    .filter((it) => it.kind === "file")
    .map((it) => it.getAsFile())
    .filter((file): file is File => Boolean(file));
}

export function mountDropzone(root: HTMLElement, bindings: DropzoneBindings): DropzoneController {
  const input = root.querySelector<HTMLInputElement>("[data-input]");
  const chooseButtons = Array.from(root.querySelectorAll<HTMLElement>("[data-choose]"));
  const clearButtons = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-clear]"));
  const dropzone = root.querySelector<HTMLElement>("[data-dropzone]");
  const statuses = Array.from(root.querySelectorAll<HTMLElement>("[data-drop-status]"));
  
  console.log("[Dropzone] Mounting with elements:", { 
    input: !!input, 
    chooseButtons: chooseButtons.length, 
    clearButtons: clearButtons.length, 
    dropzone: !!dropzone,
    statuses: statuses.length
  });
  
  if (!input || chooseButtons.length === 0 || clearButtons.length === 0 || !dropzone) {
    console.error("[Dropzone] Missing required elements!", { input, chooseButtons, clearButtons, dropzone });
    return { setHasItems: () => {}, setStatus: () => {} };
  }
  
  console.log("[Dropzone] All elements found, attaching listeners...");

  let dragDepth = 0;

  function isFileDrag(e: DragEvent): boolean {
    const types = Array.from(e.dataTransfer?.types ?? []);
    return types.includes("Files");
  }

  // Some browsers / element stacks can swallow drag events, making the cursor show "not allowed"
  // and causing the file to "bounce back". Capture-phase guards ensure file drags are always allowed
  // and that dropping files doesn't navigate away, while not interfering with internal DnD (text/plain).
  const captureFileDragOver = (e: DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
  };
  const captureFileDrop = (e: DragEvent) => {
    if (!isFileDrag(e)) return;
    const target = e.target instanceof Node ? e.target : null;
    if (target && dropzone.contains(target)) return;
    e.preventDefault();
  };
  document.addEventListener("dragover", captureFileDragOver, { capture: true });
  document.addEventListener("drop", captureFileDrop, { capture: true });

  for (const clearButton of clearButtons) {
    clearButton.addEventListener("click", () => {
      console.log("[Dropzone] Clear button clicked");
      input.value = "";
      bindings.onClearAll();
    });
  }
  
  // Manually trigger file input click to ensure it works across all scenarios
  for (const chooseButton of chooseButtons) {
    chooseButton.addEventListener("click", (e) => {
      console.log("[Dropzone] Choose button clicked");
      e.preventDefault();
      e.stopPropagation();
      // Ensure selecting the same file again still triggers a change event.
      input.value = "";
      console.log("[Dropzone] Triggering input.click()");
      input.click();
    });
  }
  
  input.addEventListener("change", (e) => {
    const files = Array.from(input.files ?? []);
    console.log(`[Dropzone] input change event fired: ${files.length} files`, files.map(f => f.name));
    if (files.length > 0) {
      bindings.onFiles(files);
    } else {
      console.warn("[Dropzone] No files in input.files array");
    }
  });

  dropzone.addEventListener("dragenter", (e) => {
    console.log("[Dropzone] dragenter");
    e.preventDefault();
    e.stopPropagation();
    dragDepth += 1;
    setDropzoneActive(dropzone, dragDepth > 0);
  });
  
  dropzone.addEventListener("dragover", (e) => {
    // CRITICAL: Must prevent default to allow drop!
    e.preventDefault();
    e.stopPropagation();
    // Ensure browser doesn't treat dragged images as a navigation/open action.
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
    setDropzoneActive(dropzone, true);
  });
  
  dropzone.addEventListener("dragleave", (e) => {
    console.log("[Dropzone] dragleave");
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    setDropzoneActive(dropzone, dragDepth > 0);
  });
  dropzone.addEventListener("drop", (e) => {
    console.log("[Dropzone] DROP EVENT FIRED!");
    e.preventDefault();
    e.stopPropagation();
    dragDepth = 0;
    setDropzoneActive(dropzone, false);
    const dt = e.dataTransfer;
    if (!dt) {
      console.warn("[Dropzone] No dataTransfer in drop event");
      bindings.onFiles([]);
      return;
    }

    const filesLen = dt.files?.length ?? 0;
    const itemsLen = dt.items?.length ?? 0;
    console.log(`[Dropzone] drop: files.length=${filesLen} items.length=${itemsLen}`);
    if (dt.items?.length) {
      for (const it of Array.from(dt.items)) {
        console.log(`[Dropzone] item kind=${it.kind} type=${it.type}`);
      }
    }

    const files = collectDropFiles(dt);
    const images = files.filter(isSupportedImageFile);
    console.log(`[Dropzone] collected files=${files.length} images=${images.length}`);
    console.log("[Dropzone] Calling bindings.onFiles with", files.length, "files");
    bindings.onFiles(files);
  });

  console.log("[Dropzone] Mount complete - all listeners attached");

  return {
    setHasItems(hasItems) {
      for (const clearButton of clearButtons) clearButton.disabled = !hasItems;
    },
    setStatus(text) {
      for (const status of statuses) {
        status.textContent = text;
        status.classList.toggle("hidden", text.trim().length === 0);
      }
    }
  };
}
