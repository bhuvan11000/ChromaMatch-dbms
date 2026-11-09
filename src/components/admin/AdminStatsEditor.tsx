"use client";

import { useState, type FormEvent } from "react";

import { Button, Input } from "@/components/ui";
import {
  adminStatsPatchSchema,
  type AdminStatsPatch,
  type AdminUserDetail,
} from "@/lib/schemas/admin";

export interface AdminStatsEditorProps {
  user: AdminUserDetail;
  saving: boolean;
  error: string | null;
  successMessage?: string | null;
  onSave: (patch: AdminStatsPatch) => void;
}

function toDateTimeLocal(value: string | null): string {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function fromDateTimeLocal(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function issuePath(issue: { path: PropertyKey[] }): string | null {
  const first = issue.path[0];
  return first === undefined ? null : String(first);
}

/**
 * The §5.7.7 stats allow-list editor. Client validation uses the same Zod
 * schema as the API; database CHECKs remain the final authority.
 */
export function AdminStatsEditor({
  user,
  saving,
  error,
  successMessage = null,
  onSave,
}: AdminStatsEditorProps) {
  const [globalBestScore, setGlobalBestScore] = useState(
    user.globalBestScore === null ? "" : String(user.globalBestScore),
  );
  const [globalBestAchievedAt, setGlobalBestAchievedAt] = useState(
    toDateTimeLocal(user.globalBestAchievedAt),
  );
  const [totalGamesPlayed, setTotalGamesPlayed] = useState(String(user.totalGamesPlayed));
  const [currentDailyStreak, setCurrentDailyStreak] = useState(String(user.currentDailyStreak));
  const [longestDailyStreak, setLongestDailyStreak] = useState(String(user.longestDailyStreak));
  const [lastDailyPlayedDate, setLastDailyPlayedDate] = useState(user.lastDailyPlayedDate ?? "");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors: Record<string, string> = {};
    const score = globalBestScore.trim() === "" ? null : Number(globalBestScore);
    const achievedAt =
      globalBestAchievedAt.trim() === "" ? null : fromDateTimeLocal(globalBestAchievedAt);
    const games = totalGamesPlayed.trim() === "" ? Number.NaN : Number(totalGamesPlayed);
    const current = currentDailyStreak.trim() === "" ? Number.NaN : Number(currentDailyStreak);
    const longest = longestDailyStreak.trim() === "" ? Number.NaN : Number(longestDailyStreak);

    if (score !== null && !Number.isFinite(score)) {
      nextErrors.globalBestScore = "Enter a number.";
    }
    if (globalBestAchievedAt.trim() !== "" && achievedAt === null) {
      nextErrors.globalBestAchievedAt = "Enter a valid date and time.";
    }
    if (!Number.isFinite(games)) {
      nextErrors.totalGamesPlayed = "Enter a whole number.";
    }
    if (!Number.isFinite(current)) {
      nextErrors.currentDailyStreak = "Enter a whole number.";
    }
    if (!Number.isFinite(longest)) {
      nextErrors.longestDailyStreak = "Enter a whole number.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setFormError("Check the highlighted fields.");
      return;
    }

    const patch: AdminStatsPatch = {
      globalBestScore: score,
      globalBestAchievedAt: achievedAt,
      totalGamesPlayed: games,
      currentDailyStreak: current,
      longestDailyStreak: longest,
      lastDailyPlayedDate: lastDailyPlayedDate.trim() === "" ? null : lastDailyPlayedDate,
    };

    const parsed = adminStatsPatchSchema.safeParse(patch);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issuePath(issue);
        if (path && !errors[path]) {
          errors[path] = issue.message;
        }
      }
      setFieldErrors(errors);
      setFormError(parsed.error.issues[0]?.message ?? "Check the highlighted fields.");
      return;
    }

    setFieldErrors({});
    setFormError(null);
    onSave(parsed.data);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Global PB score"
          type="number"
          min={0}
          max={30}
          step="0.1"
          inputMode="decimal"
          value={globalBestScore}
          onChange={(event) => setGlobalBestScore(event.target.value)}
          error={fieldErrors.globalBestScore}
          hint="Leave blank to clear the PB."
        />
        <Input
          label="Global PB achieved at"
          type="datetime-local"
          value={globalBestAchievedAt}
          onChange={(event) => setGlobalBestAchievedAt(event.target.value)}
          error={fieldErrors.globalBestAchievedAt}
          hint="Stored as UTC. Displayed in your local time."
        />
        <Input
          label="Total games played"
          type="number"
          min={0}
          step="1"
          inputMode="numeric"
          value={totalGamesPlayed}
          onChange={(event) => setTotalGamesPlayed(event.target.value)}
          error={fieldErrors.totalGamesPlayed}
        />
        <Input
          label="Current Daily streak"
          type="number"
          min={0}
          step="1"
          inputMode="numeric"
          value={currentDailyStreak}
          onChange={(event) => setCurrentDailyStreak(event.target.value)}
          error={fieldErrors.currentDailyStreak}
        />
        <Input
          label="Longest Daily streak"
          type="number"
          min={0}
          step="1"
          inputMode="numeric"
          value={longestDailyStreak}
          onChange={(event) => setLongestDailyStreak(event.target.value)}
          error={fieldErrors.longestDailyStreak}
        />
        <Input
          label="Last Daily played"
          type="date"
          value={lastDailyPlayedDate}
          onChange={(event) => setLastDailyPlayedDate(event.target.value)}
          error={fieldErrors.lastDailyPlayedDate}
          hint="Leave blank if there is no recorded day."
        />
      </div>

      {formError ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {formError}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      {successMessage ? (
        <p role="status" className="text-sm font-medium text-success">
          {successMessage}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={saving} disabled={saving}>
          {saving ? "Saving…" : "Save stats"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Database constraints still apply; invalid combinations are rejected.
        </p>
      </div>
    </form>
  );
}
