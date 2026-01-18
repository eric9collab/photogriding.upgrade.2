import { useEffect, useRef } from "react";
import { initPhotoUploader } from "../lib/photo-uploader";

export default function PhotoUploaderIsland() {
  const rootRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    const input = fileInputRef.current;
    if (!el || !input) {
      console.error("PhotoUploaderIsland: missing refs", { el, input });
      return;
    }
    console.log("Uploader hydrated - initializing...");
    const badge = el.querySelector<HTMLElement>("[data-js-ready]");
    if (badge) badge.classList.remove("hidden");
    
    try {
      initPhotoUploader(el);
      console.log("Uploader initialized successfully");
    } catch (error) {
      console.error("Failed to initialize uploader:", error);
    }
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <div
        data-toast
        role="status"
        aria-live="polite"
        className="pointer-events-auto fixed right-4 top-4 z-50 hidden max-w-[80vw] rounded-md bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-100 ring-1 ring-rose-400/30 backdrop-blur"
      ></div>

      <header className="sticky top-0 z-30 mb-3 md:hidden">
        <div className="flex items-center justify-between rounded-xl bg-black/35 px-3 py-2 ring-1 ring-white/10 backdrop-blur">
          <button
            type="button"
            data-mobile-summary
            className="truncate text-xs font-medium text-zinc-200"
          ></button>
          <div
            data-js-ready
            className="hidden h-2 w-2 rounded-full bg-emerald-400/80 ring-2 ring-emerald-400/20"
            aria-label="JS ready"
            title="JS: ON"
          ></div>
        </div>
      </header>

      <section className="grid gap-4 pb-[calc(84px+env(safe-area-inset-bottom))] md:pb-0">
        <div className="rounded-panel bg-zinc-900/50 p-4 shadow-panel ring-1 ring-white/10 md:p-6">
          <div
            data-dropzone
            className="relative flex flex-col items-stretch gap-3 rounded-panel border border-dashed border-white/15 bg-black/20 p-4 text-center transition md:p-8"
          >
            <div data-drop-expanded className="grid gap-1.5 md:gap-2">
              <p className="text-sm font-medium">拖拉圖片到這裡上傳</p>
              <p className="text-xs text-zinc-400">
                支援多檔；只在記憶體中處理，不會保存到相簿/專案。
              </p>
              <p data-drop-status className="hidden text-xs text-zinc-200"></p>
            </div>

            <div data-drop-compact className="hidden items-center justify-between gap-3 text-left">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-zinc-100">已接收照片</div>
                <div data-drop-status className="truncate text-xs text-zinc-300"></div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  data-choose
                  className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-50 ring-1 ring-white/15 hover:bg-white/15"
                >
                  新增
                </button>
                <button
                  type="button"
                  data-clear
                  className="rounded-md bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-200 ring-1 ring-white/10 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled
                >
                  清空
                </button>
              </div>
            </div>

            <div data-drop-actions className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                data-choose
                className="cursor-pointer rounded-md bg-white/10 px-4 py-2 text-sm font-medium text-zinc-50 ring-1 ring-white/15 hover:bg-white/15"
              >
                選擇檔案
              </button>
              <button
                type="button"
                data-clear
                className="rounded-md bg-white/5 px-4 py-2 text-sm font-medium text-zinc-200 ring-1 ring-white/10 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                disabled
              >
                清空全部
              </button>
              <input
                ref={fileInputRef}
                id="uploader-input"
                data-input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
              />
            </div>
          </div>

          <div className="mt-4 md:mt-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="hidden md:inline-flex rounded-md bg-white/5 p-1 ring-1 ring-white/10">
                <button type="button" data-mode="organize" className="rounded px-3 py-1.5 text-xs font-medium text-zinc-100">
                  整理
                </button>
                <button
                  type="button"
                  data-mode="output"
                  className="rounded px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-zinc-100"
                >
                  產出
                </button>
              </div>

              <div className="inline-flex rounded-md bg-white/5 p-1 ring-1 ring-white/10 md:order-none">
                <button
                  type="button"
                  data-sort="asc"
                  className="rounded px-3 py-1.5 text-xs font-medium text-zinc-100"
                >
                  由舊到新
                </button>
                <button
                  type="button"
                  data-sort="desc"
                  className="rounded px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-zinc-100"
                >
                  由新到舊
                </button>
              </div>
            </div>

            <div data-summary className="hidden rounded-lg bg-white/5 px-4 py-3 text-sm text-zinc-200 ring-1 ring-white/10"></div>

            <section data-organize className="grid gap-3 md:gap-4">
              <div className="flex items-center justify-between gap-3">
                <div className="truncate text-xs text-zinc-400">
                  同日相片可拖曳排序作為 tie-break。
                </div>
                <label className="hidden md:flex items-center gap-2 text-xs text-zinc-300">
                  <span>縮圖欄數</span>
                  <input data-thumb-cols type="range" min="2" max="6" step="1" defaultValue="5" />
                  <span data-thumb-cols-value className="w-4 text-right">5</span>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-[1fr_360px] md:items-start">
                <div className="pb-2 md:pb-0">
                  <div data-empty className="text-sm text-zinc-400">
                    尚未選取任何圖片。
                  </div>
                  <div data-grid className="hidden gap-2 md:gap-2"></div>
                </div>

                <div
                  data-drawer
                  className="hidden rounded-panel bg-black/20 ring-1 ring-white/10 md:sticky md:top-6 md:block"
                ></div>
              </div>
            </section>

            <section data-output className="hidden">
              <div data-preview className="mt-5 hidden md:mt-8 md:pb-0">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-zinc-50">拼貼預覽</h2>

                  <div className="flex items-center gap-2 md:hidden">
                    <div className="inline-flex rounded-md bg-white/5 p-1 ring-1 ring-white/10">
                      <button type="button" data-preview-mode="grid" className="rounded px-3 py-1.5 text-xs font-semibold text-zinc-100">
                        Grid
                      </button>
                      <button type="button" data-preview-mode="timeline" className="rounded px-3 py-1.5 text-xs font-semibold text-zinc-300">
                        Timeline
                      </button>
                      <button type="button" data-preview-mode="gif" className="rounded px-3 py-1.5 text-xs font-semibold text-zinc-300">
                        GIF
                      </button>
                    </div>

                    <div
                      data-preview-cols-mobile
                      className="hidden items-center gap-1 rounded-md bg-white/5 p-1 ring-1 ring-white/10"
                    >
                      <button type="button" data-preview-cols-btn="2" className="rounded px-2.5 py-1 text-[11px] font-semibold text-zinc-200">
                        2
                      </button>
                      <button type="button" data-preview-cols-btn="3" className="rounded px-2.5 py-1 text-[11px] font-semibold text-zinc-200">
                        3
                      </button>
                      <button type="button" data-preview-cols-btn="4" className="rounded px-2.5 py-1 text-[11px] font-semibold text-zinc-200">
                        4
                      </button>
                    </div>

                    <label className="inline-flex items-center gap-2 rounded-md bg-white/5 px-2 py-1 ring-1 ring-white/10">
                      <span className="text-[11px] font-semibold text-zinc-200">日期</span>
                      <input data-show-dates type="checkbox" defaultChecked className="peer sr-only" />
                      <span className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-white/10 ring-1 ring-white/10 transition-colors duration-200 ease-in-out peer-checked:bg-emerald-500/25 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-300/40 peer-checked:[&>[data-thumb]]:translate-x-4 peer-checked:[&>[data-thumb]]:scale-[1.06]">
                        <span
                          data-thumb
                          className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-zinc-200 shadow-sm transition-transform duration-200 ease-in-out peer-checked:bg-emerald-200"
                        />
                      </span>
                    </label>
                  </div>

                  <div className="hidden md:flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-zinc-300">時區</label>
                      <select
                        data-timezone
                        className="h-8 rounded-md bg-white/5 px-2 text-xs text-zinc-100 ring-1 ring-white/10"
                      >
                        <option value="browser">瀏覽器</option>
                        <option value="Asia/Taipei">Asia/Taipei</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        data-export="png"
                        className="rounded-md bg-white/10 px-3 py-2 text-xs font-medium text-zinc-50 ring-1 ring-white/15 hover:bg-white/15"
                      >
                        匯出 PNG
                      </button>
                      <button
                        type="button"
                        data-export="jpg"
                        className="rounded-md bg-white/5 px-3 py-2 text-xs font-medium text-zinc-200 ring-1 ring-white/10 hover:bg-white/10"
                      >
                        匯出 JPG
                      </button>
                      <button
                        type="button"
                        data-export="gif"
                        className="hidden rounded-md bg-emerald-500/15 px-3 py-2 text-xs font-medium text-emerald-100 ring-1 ring-emerald-400/25 hover:bg-emerald-500/20"
                      >
                        匯出 GIF
                      </button>
                    </div>

                    <div className="inline-flex rounded-md bg-white/5 p-1 ring-1 ring-white/10">
                      <button
                        type="button"
                        data-preview-mode="grid"
                        className="rounded px-3 py-1.5 text-xs font-medium text-zinc-100"
                      >
                        Grid
                      </button>
                      <button
                        type="button"
                        data-preview-mode="timeline"
                        className="rounded px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-zinc-100"
                      >
                        Timeline
                      </button>
                      <button
                        type="button"
                        data-preview-mode="gif"
                        className="rounded px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-zinc-100"
                      >
                        GIF
                      </button>
                    </div>

                    <label className="inline-flex items-center gap-2 rounded-md bg-white/5 px-2 py-1 ring-1 ring-white/10">
                      <span className="text-xs text-zinc-200">顯示日期</span>
                      <input data-show-dates type="checkbox" defaultChecked className="peer sr-only" />
                      <span className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-white/10 ring-1 ring-white/10 transition-colors duration-200 ease-in-out peer-checked:bg-emerald-500/25 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-300/40 peer-checked:[&>[data-thumb]]:translate-x-4 peer-checked:[&>[data-thumb]]:scale-[1.06]">
                        <span
                          data-thumb
                          className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-zinc-200 shadow-sm transition-transform duration-200 ease-in-out peer-checked:bg-emerald-200"
                        />
                      </span>
                    </label>

                    <label data-cols-wrap className="flex items-center gap-2 text-xs text-zinc-300">
                      <span>欄數</span>
                      <input data-preview-cols type="range" min="2" max="6" step="1" defaultValue="4" />
                      <span data-preview-cols-value className="w-4 text-right">
                        4
                      </span>
                    </label>
                  </div>
                </div>

                <div data-preview-grid className="grid gap-3"></div>
                <div data-preview-timeline className="hidden"></div>
              </div>
            </section>
          </div>
        </div>
      </section>

      <div
        data-sheet
        className="fixed inset-0 z-50 hidden overscroll-none md:hidden"
        aria-hidden="true"
      >
        <div data-sheet-backdrop className="absolute inset-0 bg-black/60"></div>
        <div
          data-sheet-panel
          className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-hidden overscroll-none rounded-t-2xl bg-zinc-950 ring-1 ring-white/10"
        >
          <div data-sheet-handle className="flex items-center justify-center p-3">
            <div className="h-1.5 w-12 rounded-full bg-white/15"></div>
          </div>
          <div
            data-sheet-content
            className="max-h-[calc(85dvh-48px)] overflow-auto overscroll-contain px-4 pb-[calc(16px+env(safe-area-inset-bottom))] touch-pan-y [-webkit-overflow-scrolling:touch]"
          ></div>
        </div>
      </div>

      <div
        data-mobile-bar
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-zinc-950/90 backdrop-blur md:hidden"
      >
        <div className="mx-auto grid max-w-5xl grid-cols-[1fr_auto] items-center gap-3 px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3">
          <div className="grid grid-cols-2 rounded-lg bg-white/5 p-1 ring-1 ring-white/10">
            <button type="button" data-mode="organize" className="rounded-md px-3 py-2 text-sm font-semibold text-zinc-100">
              整理
            </button>
            <button type="button" data-mode="output" className="rounded-md px-3 py-2 text-sm font-semibold text-zinc-300">
              產出
            </button>
          </div>

          <button
            type="button"
            data-mobile-export
            className="hidden rounded-lg bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-100 ring-1 ring-emerald-400/25"
          >
            匯出
          </button>
        </div>
      </div>

      <div
        data-export-sheet
        className="fixed inset-0 z-50 hidden overscroll-none md:hidden"
        aria-hidden="true"
      >
        <div data-export-sheet-backdrop className="absolute inset-0 bg-black/60"></div>
        <div
          data-export-sheet-panel
          className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-hidden overscroll-none rounded-t-2xl bg-zinc-950 ring-1 ring-white/10"
        >
          <div data-export-sheet-handle className="flex items-center justify-center p-3">
            <div className="h-1.5 w-12 rounded-full bg-white/15"></div>
          </div>
          <div
            data-export-sheet-content
            className="max-h-[calc(85dvh-48px)] overflow-auto overscroll-contain px-4 pb-[calc(16px+env(safe-area-inset-bottom))] touch-pan-y [-webkit-overflow-scrolling:touch]"
          >
            <div className="grid gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-50">匯出</h3>
                <div className="text-xs text-zinc-400">依目前預覽設定</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  data-export="png"
                  className="rounded-lg bg-white/10 px-4 py-3 text-sm font-semibold text-zinc-50 ring-1 ring-white/15"
                >
                  PNG
                </button>
                <button
                  type="button"
                  data-export="jpg"
                  className="rounded-lg bg-white/5 px-4 py-3 text-sm font-semibold text-zinc-200 ring-1 ring-white/10"
                >
                  JPG
                </button>
                <button
                  type="button"
                  data-export="gif"
                  className="col-span-2 hidden rounded-lg bg-emerald-500/15 px-4 py-3 text-sm font-semibold text-emerald-100 ring-1 ring-emerald-400/25"
                >
                  GIF
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        data-modal
        className="fixed inset-0 z-50 hidden items-center justify-center bg-black/60 p-6"
        aria-hidden="true"
      >
        <div className="w-full max-w-sm rounded-panel bg-zinc-950 p-5 shadow-panel ring-1 ring-white/10">
          <div className="flex items-start justify-between gap-4">
            <h3 className="text-sm font-semibold text-zinc-50">編輯日期</h3>
            <button
              type="button"
              data-cancel
              className="rounded-md bg-white/5 px-2 py-1 text-xs text-zinc-200 ring-1 ring-white/10 hover:bg-white/10"
            >
              關閉
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            <label className="grid gap-1">
              <span className="text-xs text-zinc-300">日期（必填）</span>
              <input
                data-date
                type="date"
                className="h-10 w-full rounded-md bg-white/5 px-3 text-sm text-zinc-50 ring-1 ring-white/10"
                required
              />
            </label>

            <label className="grid gap-1">
              <span className="text-xs text-zinc-300">時間（可選）</span>
              <input
                data-time
                type="time"
                step="60"
                className="h-10 w-full rounded-md bg-white/5 px-3 text-sm text-zinc-50 ring-1 ring-white/10"
              />
            </label>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                data-save
                className="rounded-md bg-white/10 px-4 py-2 text-sm font-medium text-zinc-50 ring-1 ring-white/15 hover:bg-white/15"
              >
                儲存
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        data-crop-modal
        className="fixed inset-0 z-50 hidden items-center justify-center bg-black/60 p-6"
        aria-hidden="true"
      >
        <div className="w-full max-w-xl rounded-panel bg-zinc-950 p-5 shadow-panel ring-1 ring-white/10">
          <div className="flex items-start justify-between gap-4">
            <div className="grid gap-1">
              <h3 className="text-sm font-semibold text-zinc-50">裁切（1:1）</h3>
              <p data-crop-hint className="text-xs text-zinc-400"></p>
            </div>
            <button
              type="button"
              data-crop-cancel
              className="rounded-md bg-white/5 px-2 py-1 text-xs text-zinc-200 ring-1 ring-white/10 hover:bg-white/10"
            >
              關閉
            </button>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-[1fr_220px]">
            <div className="rounded-panel bg-black/30 p-3 ring-1 ring-white/10">
              <div className="relative">
                <canvas
                  data-crop-canvas
                  width="768"
                  height="768"
                  className="aspect-square h-auto w-full touch-none rounded-lg bg-zinc-900"
                />
                {import.meta.env.DEV ? (
                  <div
                    data-crop-debug-overlay
                    className="pointer-events-none absolute inset-0 hidden rounded-lg"
                  >
                    <div className="absolute left-1/3 top-0 h-full w-px bg-white/20"></div>
                    <div className="absolute left-2/3 top-0 h-full w-px bg-white/20"></div>
                    <div className="absolute top-1/3 left-0 h-px w-full bg-white/20"></div>
                    <div className="absolute top-2/3 left-0 h-px w-full bg-white/20"></div>
                    <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-300/80 ring-2 ring-black/40"></div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="grid content-start gap-3">
              <label className="grid gap-1">
                <span className="text-xs text-zinc-300">縮放</span>
                <input data-crop-zoom type="range" min="1" max="4" step="0.01" className="w-full" />
              </label>

              {import.meta.env.DEV ? (
                <label className="flex items-center justify-between gap-3 rounded-md bg-white/5 px-3 py-2 text-xs text-zinc-200 ring-1 ring-white/10">
                  <span>顯示裁切參考線</span>
                  <input data-crop-debug-toggle type="checkbox" className="h-4 w-4 accent-emerald-400" />
                </label>
              ) : null}

              <button
                type="button"
                data-crop-recenter
                className="rounded-md bg-white/5 px-3 py-2 text-sm font-medium text-zinc-200 ring-1 ring-white/10 hover:bg-white/10"
              >
                重新自動置中
              </button>

              <button
                type="button"
                data-crop-save
                className="rounded-md bg-white/10 px-3 py-2 text-sm font-medium text-zinc-50 ring-1 ring-white/15 hover:bg-white/15"
              >
                儲存裁切
              </button>

              <p className="text-xs text-zinc-400">拖曳預覽畫面以移動裁切位置。</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
