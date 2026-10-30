import { cn } from "@/lib/cn";

export type TestStripSize = "sm" | "md" | "lg";

export interface TestStripProps {
  size?: TestStripSize;
  /** Well colours in display order. */
  colors?: readonly string[];
  /** Adds a dashed “?” well, hinting at the memory round. */
  mystery?: boolean;
  /** Accessible label; omit when the strip is purely decorative. */
  label?: string;
  className?: string;
}

/** Brand test-strip palette, used outside the game stage only. */
export const TEST_STRIP_COLORS = ["#ff5e5b", "#ffb800", "#34d399", "#22d3ee", "#a78bfa"] as const;

const SIZE_CLASSES: Record<TestStripSize, { frame: string; well: string; gap: string }> = {
  sm: { frame: "px-2 pt-3 pb-3", well: "h-7", gap: "gap-1.5" },
  md: { frame: "px-2.5 pt-3.5 pb-3.5", well: "h-10", gap: "gap-2" },
  lg: { frame: "px-3 pt-4 pb-4", well: "h-16 sm:h-20", gap: "gap-2.5" },
};

/**
 * A strip of colour test wells in a dark bezel, with sprocket holes. It is a
 * playful photography/darkroom motif and a brand flourish — never a game
 * swatch and never used inside `<GameStage>`.
 */
export function TestStrip({
  size = "md",
  colors = TEST_STRIP_COLORS,
  mystery = false,
  label,
  className,
}: TestStripProps) {
  const wells = mystery ? [...colors, null] : colors;
  const sizing = SIZE_CLASSES[size];

  return (
    <div
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        "cm-test-strip relative flex w-full overflow-hidden rounded-[0.9rem] border border-border bg-[#17171b]",
        sizing.frame,
        sizing.gap,
        className,
      )}
    >
      {wells.map((color, index) =>
        color ? (
          <span
            key={`${color}-${index}`}
            className={cn(
              "min-w-0 flex-1 rounded-[0.45rem] border border-white/10 shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]",
              sizing.well,
            )}
            style={{ backgroundColor: color }}
          />
        ) : (
          <span
            key="mystery"
            className={cn(
              "grid min-w-0 flex-1 place-items-center rounded-[0.45rem] border border-dashed border-white/30 bg-white/5",
              sizing.well,
            )}
          >
            <span aria-hidden="true" className="font-mono text-base font-bold text-white/55">
              ?
            </span>
          </span>
        ),
      )}
    </div>
  );
}
