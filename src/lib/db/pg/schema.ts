import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  integer,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * PostgreSQL schema — migration 1 (tables, keys, simple constraints).
 *
 * Source of truth: docs/ChromaMatch_Database_Design.md §5–§6 and
 * docs/ChromaMatch_Architecture.md §5.8.1–5.8.2.
 *
 * NUMERIC columns intentionally use Drizzle's default string mapping. Convert
 * them at the data-access boundary with helpers from ./mappers.ts.
 *
 * Deliberately deferred to migration 2+:
 * - Cross-column CHECKs:
 *   * users: (global_best_score IS NULL) = (global_best_achieved_at IS NULL)
 *   * users: longest_daily_streak >= current_daily_streak
 *   * achievements: threshold required for games_played/daily_streak/
 *     perfect_round and NULL for new_pb/first_daily/first_global
 *   * rooms: started_at non-null iff status is in_progress/finished;
 *     ended_at non-null iff status is finished/cancelled
 *   * room_players: (best_score IS NULL) = (best_achieved_at IS NULL)
 * - Triggers:
 *   * room_players BEFORE INSERT: lobby-only joining and room capacity
 *   * room_players BEFORE UPDATE: attempts within attempts_limit, forward-only
 *     status transitions, non-decreasing best_score
 *   * rooms BEFORE UPDATE: allowed status transitions and timestamps
 * - Partial/composite indexes from DB doc §9 / Architecture §5.8.6.
 * - Functions/procedures/views from Architecture §5.8.3–5.8.5.
 * - "Exactly 3 colors" per challenge/room is a transaction/function invariant,
 *   not a CHECK (the composite PK only guarantees at most 3).
 * - Optional case-insensitive username uniqueness (Architecture §1.5 R2).
 * - Room size upper bound is a service constant (ROOM_MAX_SIZE = 10); the DB
 *   CHECK only enforces the documented minimum (>= 2).
 */

export const users = pgTable(
  "users",
  {
    userId: bigint("user_id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
    username: varchar("username", { length: 30 }).notNull().unique("users_username_key"),
    email: varchar("email", { length: 255 }).notNull().unique("users_email_key"),
    passwordHash: text("password_hash").notNull(),
    role: varchar("role", { length: 10 }).notNull().default("player"),
    isBanned: boolean("is_banned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    globalBestScore: numeric("global_best_score", { precision: 3, scale: 1 }),
    globalBestAchievedAt: timestamp("global_best_achieved_at", {
      withTimezone: true,
      mode: "date",
    }),
    totalGamesPlayed: integer("total_games_played").notNull().default(0),
    currentDailyStreak: integer("current_daily_streak").notNull().default(0),
    longestDailyStreak: integer("longest_daily_streak").notNull().default(0),
    lastDailyPlayedDate: date("last_daily_played_date", { mode: "string" }),
  },
  (table) => [
    check("users_role_check", sql`${table.role} in ('player', 'admin')`),
    check("users_global_best_score_check", sql`${table.globalBestScore} between 0 and 30`),
    check("users_total_games_played_check", sql`${table.totalGamesPlayed} >= 0`),
    check("users_current_daily_streak_check", sql`${table.currentDailyStreak} >= 0`),
    check("users_longest_daily_streak_check", sql`${table.longestDailyStreak} >= 0`),
  ],
);

export const dailyChallenges = pgTable("daily_challenges", {
  dailyChallengeId: bigint("daily_challenge_id", { mode: "number" })
    .generatedByDefaultAsIdentity()
    .primaryKey(),
  challengeDate: date("challenge_date", { mode: "string" })
    .notNull()
    .unique("daily_challenges_challenge_date_key"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const challengeColors = pgTable(
  "challenge_colors",
  {
    dailyChallengeId: bigint("daily_challenge_id", { mode: "number" })
      .notNull()
      .references(() => dailyChallenges.dailyChallengeId, { onDelete: "cascade" }),
    roundNumber: smallint("round_number").notNull(),
    hue: numeric("hue", { precision: 4, scale: 1 }).notNull(),
    saturation: numeric("saturation", { precision: 4, scale: 1 }).notNull(),
    value: numeric("value", { precision: 4, scale: 1 }).notNull(),
  },
  (table) => [
    primaryKey({
      name: "challenge_colors_pkey",
      columns: [table.dailyChallengeId, table.roundNumber],
    }),
    check("challenge_colors_round_number_check", sql`${table.roundNumber} between 1 and 3`),
    check("challenge_colors_hue_check", sql`${table.hue} between 0 and 360`),
    check("challenge_colors_saturation_check", sql`${table.saturation} between 0 and 100`),
    check("challenge_colors_value_check", sql`${table.value} between 0 and 100`),
  ],
);

export const dailyPersonalBests = pgTable(
  "daily_personal_bests",
  {
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    dailyChallengeId: bigint("daily_challenge_id", { mode: "number" })
      .notNull()
      .references(() => dailyChallenges.dailyChallengeId, { onDelete: "restrict" }),
    bestScore: numeric("best_score", { precision: 3, scale: 1 }).notNull(),
    achievedAt: timestamp("achieved_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    primaryKey({
      name: "daily_personal_bests_pkey",
      columns: [table.userId, table.dailyChallengeId],
    }),
    check("daily_personal_bests_best_score_check", sql`${table.bestScore} between 0 and 30`),
  ],
);

export const achievements = pgTable(
  "achievements",
  {
    achievementId: bigint("achievement_id", { mode: "number" })
      .generatedByDefaultAsIdentity()
      .primaryKey(),
    name: varchar("name", { length: 60 }).notNull().unique("achievements_name_key"),
    description: text("description").notNull(),
    criteriaType: varchar("criteria_type", { length: 20 }).notNull(),
    threshold: numeric("threshold", { precision: 6, scale: 1 }),
    criteriaDescription: text("criteria_description").notNull(),
  },
  (table) => [
    check(
      "achievements_criteria_type_check",
      sql`${table.criteriaType} in ('games_played', 'daily_streak', 'perfect_round', 'new_pb', 'first_daily', 'first_global')`,
    ),
    check("achievements_threshold_check", sql`${table.threshold} > 0`),
  ],
);

export const userAchievements = pgTable(
  "user_achievements",
  {
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    achievementId: bigint("achievement_id", { mode: "number" })
      .notNull()
      .references(() => achievements.achievementId, { onDelete: "restrict" }),
    earnedAt: timestamp("earned_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "user_achievements_pkey",
      columns: [table.userId, table.achievementId],
    }),
  ],
);

export const rooms = pgTable(
  "rooms",
  {
    roomId: bigint("room_id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
    roomCode: varchar("room_code", { length: 8 }).notNull().unique("rooms_room_code_key"),
    creatorId: bigint("creator_id", { mode: "number" })
      .notNull()
      .references(() => users.userId, { onDelete: "restrict" }),
    roomSize: smallint("room_size").notNull(),
    timerSeconds: smallint("timer_seconds"),
    attemptsLimit: smallint("attempts_limit").notNull(),
    status: varchar("status", { length: 12 }).notNull().default("lobby"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    endedAt: timestamp("ended_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    check("rooms_room_size_check", sql`${table.roomSize} >= 2`),
    check("rooms_timer_seconds_check", sql`${table.timerSeconds} in (5, 10, 15)`),
    check("rooms_attempts_limit_check", sql`${table.attemptsLimit} in (3, 5)`),
    check(
      "rooms_status_check",
      sql`${table.status} in ('lobby', 'in_progress', 'finished', 'cancelled')`,
    ),
  ],
);

export const roomColors = pgTable(
  "room_colors",
  {
    roomId: bigint("room_id", { mode: "number" })
      .notNull()
      .references(() => rooms.roomId, { onDelete: "cascade" }),
    roundNumber: smallint("round_number").notNull(),
    hue: numeric("hue", { precision: 4, scale: 1 }).notNull(),
    saturation: numeric("saturation", { precision: 4, scale: 1 }).notNull(),
    value: numeric("value", { precision: 4, scale: 1 }).notNull(),
  },
  (table) => [
    primaryKey({
      name: "room_colors_pkey",
      columns: [table.roomId, table.roundNumber],
    }),
    check("room_colors_round_number_check", sql`${table.roundNumber} between 1 and 3`),
    check("room_colors_hue_check", sql`${table.hue} between 0 and 360`),
    check("room_colors_saturation_check", sql`${table.saturation} between 0 and 100`),
    check("room_colors_value_check", sql`${table.value} between 0 and 100`),
  ],
);

export const roomPlayers = pgTable(
  "room_players",
  {
    roomId: bigint("room_id", { mode: "number" })
      .notNull()
      .references(() => rooms.roomId, { onDelete: "cascade" }),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    status: varchar("status", { length: 10 }).notNull().default("active"),
    attemptsUsed: smallint("attempts_used").notNull().default(0),
    bestScore: numeric("best_score", { precision: 3, scale: 1 }),
    bestAchievedAt: timestamp("best_achieved_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    primaryKey({
      name: "room_players_pkey",
      columns: [table.roomId, table.userId],
    }),
    check("room_players_status_check", sql`${table.status} in ('active', 'finished', 'left')`),
    check("room_players_attempts_used_check", sql`${table.attemptsUsed} >= 0`),
    check("room_players_best_score_check", sql`${table.bestScore} between 0 and 30`),
  ],
);
