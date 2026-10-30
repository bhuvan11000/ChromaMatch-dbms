import { cn } from "@/lib/cn";

export type SpinnerSize = "sm" | "md" | "lg";

export interface SpinnerProps {
  size?: SpinnerSize;
  /** Screen-reader label; ignored when `decorative` is true. */
  label?: string;
  decorative?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<SpinnerSize, string> = {
  sm: "size-4",
  md: "size-5",
  lg: "size-8",
};

/**
 * Aperture spinner: an outer calibration ring with an inner darkroom blade.
 * Under reduced motion the ring stops and remains fully legible.
 */
export function Spinner({
  size = "md",
  label = "Loading",
  decorative = false,
  className,
}: SpinnerProps) {
  return (
    <span
      role={decorative ? undefined : "status"}
      aria-hidden={decorative || undefined}
      className={cn("inline-flex shrink-0 items-center justify-center text-current", className)}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        className={cn("animate-spin motion-reduce:animate-none", SIZE_CLASSES[size])}
      >
        <circle
          cx="12"
          cy="12"
          r="9.5"
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeWidth="1.5"
        />
        <circle
          cx="12"
          cy="12"
          r="9.5"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="14 46"
        />
        <path
          d="M12 7.2a4.8 4.8 0 0 1 4.8 4.8"
          stroke="currentColor"
          strokeOpacity="0.7"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
      {decorative ? null : <span className="sr-only">{label}</span>}
    </span>
  );
}
