import { cn } from "@/lib/cn";

interface BarcodeModule {
  bar: boolean;
  width: number;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A deterministic, print-style barcode. It is decorative (aria-hidden), but the
 * varied modules, quiet zones and human-readable line make it read as a real
 * player label rather than a striped rectangle.
 */
function buildModules(value: string): BarcodeModule[] {
  const random = mulberry32(hashString(value));
  const barCount = 42 + Math.floor(random() * 8);
  const modules: BarcodeModule[] = [];

  for (let index = 0; index < barCount; index += 1) {
    if (index > 0) {
      modules.push({ bar: false, width: random() > 0.82 ? 2 : 1 });
    }

    const guard = index < 2 || index >= barCount - 2;
    const roll = random();
    modules.push({
      bar: true,
      width: guard ? (index % 2 === 0 ? 2 : 1) : roll > 0.82 ? 3 : roll > 0.45 ? 2 : 1,
    });
  }

  return modules;
}

export interface BarcodeProps {
  /** Short player code, e.g. "P1-5278". Used for the pattern and the print line. */
  value: string;
  className?: string;
}

export function Barcode({ value, className }: BarcodeProps) {
  const modules = buildModules(value);
  const quietZone = 10;
  const width = modules.reduce((total, module) => total + module.width, quietZone * 2);
  const barStarts = modules.map(
    (_, index) =>
      quietZone + modules.slice(0, index).reduce((total, module) => total + module.width, 0),
  );

  return (
    <span
      aria-hidden="true"
      data-testid="barcode"
      className={cn(
        "inline-flex w-40 max-w-full flex-col items-center gap-1.5 overflow-hidden rounded-[0.2rem] border border-[#17141f]/25 bg-[#fffaf0] px-2 py-1.5 text-[#17141f] shadow-[0_2px_0_rgb(0_0_0/0.18)]",
        className,
      )}
    >
      <svg
        viewBox={`0 0 ${width} 28`}
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
        className="h-7 w-full fill-current"
      >
        {modules.map((module, index) =>
          module.bar ? (
            <rect key={index} x={barStarts[index]} y={0} width={module.width} height={28} />
          ) : null,
        )}
      </svg>
      <span className="max-w-full truncate font-mono text-[7px] leading-none font-bold tracking-[0.18em]">
        {value}
      </span>
    </span>
  );
}
