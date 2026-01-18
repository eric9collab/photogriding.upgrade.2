import { useEffect } from "react";

export default function HydrationTest() {
  const isDev = import.meta.env.DEV;

  useEffect(() => {
    if (isDev) console.log("React OK");
  }, [isDev]);

  if (!isDev) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-400/25">
      React OK
    </div>
  );
}
