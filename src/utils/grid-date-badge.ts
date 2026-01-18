export const GRID_DATE_BADGE = {
  // Preview DOM badge (Grid mode only): bottom-right, readable, refined, and consistent.
  // Mobile-first: keep the badge compact on small screens, and scale up on desktop.
  domClass:
    "absolute bottom-2 right-2 rounded-lg bg-black/60 px-2.5 py-1.5 text-[11px] font-semibold leading-none tabular-nums text-zinc-50 ring-1 ring-white/15 shadow-sm md:bottom-4 md:right-4 md:rounded-xl md:bg-black/65 md:px-6 md:py-3.5 md:text-3xl md:shadow-lg",

  // Export canvas badge style (match the DOM intent, scaled by EXPORT_SCALE).
  marginPx: 16,
  padX: 26,
  padY: 14,
  fontSize: 30, // corresponds to Tailwind `text-3xl` (30px base)
  fontWeight: 600, // semibold for better clarity
  height: 58, // fontSize + padY*2 => 30 + 28
  radius: 12, // close to Tailwind `rounded-xl`
  bg: "rgba(0,0,0,0.65)", // slightly more opaque for better contrast
  stroke: "rgba(255,255,255,0.15)",
  text: "rgba(244,244,245,1.0)", // full opacity for maximum clarity
  lineWidth: 1
} as const;
