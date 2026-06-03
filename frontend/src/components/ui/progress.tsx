import { cn } from "@/lib/utils";

/** Minimal determinate progress bar (zinc track, emerald fill). */
export function Progress({ value, className }: { value: number | null; className?: string }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-zinc-800", className)}>
      <div
        className="h-full rounded-full bg-emerald-600 transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
