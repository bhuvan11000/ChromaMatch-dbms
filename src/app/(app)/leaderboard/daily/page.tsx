import { LeaderboardView } from "@/components/leaderboard";
import { utcDateString } from "@/lib/domain/time";

/** Keep the default date anchored to the request's UTC day, not the build day. */
export const dynamic = "force-dynamic";

/** Public Daily leaderboard — Architecture §5.11.1. */
export default function DailyLeaderboardPage() {
  return <LeaderboardView mode="daily" todayUtc={utcDateString(new Date())} />;
}
