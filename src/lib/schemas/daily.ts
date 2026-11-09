import { z } from "zod";

/**
 * Daily info response — Architecture §5.10.3.
 *
 * `myBest` is null until the player has played today's challenge. The response
 * never carries colours: this endpoint must not reveal today's palette.
 */
export const dailyTodayResponseSchema = z
  .object({
    date: z.iso.date(),
    resetsAt: z.iso.datetime(),
    serverTime: z.iso.datetime(),
    myBest: z
      .object({
        score: z.number().finite().min(0).max(30),
        achievedAt: z.iso.datetime(),
      })
      .strict()
      .nullable(),
    streak: z
      .object({
        current: z.number().int().nonnegative(),
        longest: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export type DailyTodayResponse = z.infer<typeof dailyTodayResponseSchema>;
