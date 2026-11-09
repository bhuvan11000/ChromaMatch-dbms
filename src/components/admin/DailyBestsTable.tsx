import { formatScoreTenths } from "@/components/ui";
import type { AdminDailyBest } from "@/lib/schemas/admin";

export interface DailyBestsTableProps {
  bests: AdminDailyBest[];
}

function score(value: number): string {
  return formatScoreTenths(Math.round(value * 10));
}

function achievedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const iso = date.toISOString();
  return `${iso.slice(0, 10)} · ${iso.slice(11, 16)} UTC`;
}

/** The last 30 Daily personal bests on the admin user detail. */
export function DailyBestsTable({ bests }: DailyBestsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[22rem] border-collapse text-left">
        <caption className="sr-only">Recent Daily bests</caption>
        <thead>
          <tr className="border-b border-border">
            <th
              scope="col"
              className="px-3 py-2.5 font-mono text-[10px] font-bold tracking-[0.16em] text-muted-foreground uppercase"
            >
              Date
            </th>
            <th
              scope="col"
              className="px-3 py-2.5 text-right font-mono text-[10px] font-bold tracking-[0.16em] text-muted-foreground uppercase"
            >
              Best
            </th>
            <th
              scope="col"
              className="px-3 py-2.5 text-right font-mono text-[10px] font-bold tracking-[0.16em] text-muted-foreground uppercase"
            >
              Achieved
            </th>
          </tr>
        </thead>
        <tbody>
          {bests.map((best) => (
            <tr key={best.date} className="border-b border-border/70 last:border-b-0">
              <td className="px-3 py-2.5 font-mono text-xs tabular-nums">{best.date}</td>
              <td className="px-3 py-2.5 text-right font-mono text-sm font-bold tabular-nums">
                {score(best.bestScore)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground tabular-nums">
                {achievedAt(best.achievedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
