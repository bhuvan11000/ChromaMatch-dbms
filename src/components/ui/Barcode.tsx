import { cn } from "@/lib/cn";

interface BarcodeModule {
  bar: boolean;
  width: number;
}

/*
 * Code 39 (USD-3) is deliberately simple: 9 elements per character, 5 bars and
 * 4 spaces, exactly 3 of them wide. These are the standard digit patterns and
 * the `*` start/stop pattern; the element sequence starts with a bar and
 * alternates bar/space.
 */
const CODE39_START_STOP: readonly number[] = [1, 3, 1, 1, 3, 1, 3, 1, 1];
const CODE39_DIGITS: Record<string, readonly number[]> = {
  "0": [1, 1, 1, 3, 3, 1, 3, 1, 1],
  "1": [3, 1, 1, 3, 1, 1, 1, 1, 3],
  "2": [1, 1, 3, 3, 1, 1, 1, 1, 3],
  "3": [3, 1, 3, 3, 1, 1, 1, 1, 1],
  "4": [1, 1, 1, 3, 3, 1, 1, 1, 3],
  "5": [3, 1, 1, 3, 3, 1, 1, 1, 1],
  "6": [1, 1, 3, 3, 3, 1, 1, 1, 1],
  "7": [1, 1, 1, 3, 1, 1, 3, 1, 3],
  "8": [3, 1, 1, 3, 1, 1, 3, 1, 1],
  "9": [1, 1, 3, 3, 1, 1, 3, 1, 1],
};
const QUIET_ZONE_MODULES = 10;

function appendPattern(modules: BarcodeModule[], pattern: readonly number[]): void {
  pattern.forEach((width, index) => {
    modules.push({ bar: index % 2 === 0, width });
  });
}

function appendGap(modules: BarcodeModule[]): void {
  modules.push({ bar: false, width: 1 });
}

/**
 * Encodes a numeric player ID as a real Code 39 symbol. The payload is limited
 * to digits so the printed line and the scanner result always match.
 */
function encode(value: string): { modules: BarcodeModule[]; payload: string } {
  const payload = value.replace(/\D/g, "").slice(0, 10) || "0";
  const modules: BarcodeModule[] = [];

  appendPattern(modules, CODE39_START_STOP);
  appendGap(modules);

  for (const character of payload) {
    appendPattern(modules, CODE39_DIGITS[character] ?? CODE39_DIGITS["0"]);
    appendGap(modules);
  }

  appendPattern(modules, CODE39_START_STOP);

  return { modules, payload };
}

export interface BarcodeProps {
  /** Numeric player ID. Non-digits are stripped; the printed line uses the encoded payload. */
  value: string;
  className?: string;
}

/**
 * A printed Code 39 player-ID label. The cream plate and dark bars work in both
 * themes, the quiet zones are part of the SVG, and the 40 px bar height plus
 * 3:1 wide/narrow ratio make the symbol readable by a phone camera.
 */
export function Barcode({ value, className }: BarcodeProps) {
  const { modules, payload } = encode(value);
  const totalModules = modules.reduce((total, module) => total + module.width, 0);
  const width = totalModules + QUIET_ZONE_MODULES * 2;
  const barStarts = modules.map(
    (_, index) =>
      QUIET_ZONE_MODULES +
      modules.slice(0, index).reduce((total, module) => total + module.width, 0),
  );

  return (
    <span
      aria-hidden="true"
      data-testid="barcode"
      className={cn(
        "inline-flex w-72 max-w-full flex-col items-center gap-1.5 overflow-hidden rounded-[0.2rem] border border-[#17141f]/25 bg-[#fffaf0] px-2 py-1.5 text-[#17141f] shadow-[0_2px_0_rgb(0_0_0/0.18)] sm:w-80",
        className,
      )}
    >
      <svg
        viewBox={`0 0 ${width} 40`}
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
        className="h-10 w-full fill-current"
      >
        {modules.map((module, index) =>
          module.bar ? (
            <rect key={index} x={barStarts[index]} y={0} width={module.width} height={40} />
          ) : null,
        )}
      </svg>
      <span className="max-w-full truncate font-mono text-[8px] leading-none font-bold tracking-[0.24em]">
        {payload}
      </span>
    </span>
  );
}
