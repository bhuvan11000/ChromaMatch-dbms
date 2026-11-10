import { cn } from "@/lib/cn";

export interface RoomSettingsSummaryProps {
  roomSize: number;
  timerSeconds: number | null;
  attemptsLimit: number;
  className?: string;
}

/** One-line-per-setting summary of a room's rules. Text carries all meaning. */
export function RoomSettingsSummary({
  roomSize,
  timerSeconds,
  attemptsLimit,
  className,
}: RoomSettingsSummaryProps) {
  const items = [
    { label: "Players", value: `Up to ${roomSize}` },
    { label: "Guess timer", value: timerSeconds === null ? "Off" : `${timerSeconds}s per round` },
    { label: "Attempts", value: `${attemptsLimit} each` },
  ];

  return (
    <dl
      data-testid="room-settings"
      className={cn("grid grid-cols-1 gap-2 sm:grid-cols-3", className)}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-[0.55rem] border-2 border-border bg-muted/45 px-3 py-2"
        >
          <dt className="font-mono text-[8px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
            {item.label}
          </dt>
          <dd className="mt-0.5 font-display text-sm font-extrabold tracking-tight">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
