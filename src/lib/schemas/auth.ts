import { z } from "zod";

/**
 * Auth request/response schemas — Architecture §5.5.1, §5.10.2.
 *
 * These schemas are the single definition of the auth HTTP contract. Request
 * schemas are strict so unknown keys are rejected (Architecture §5.10.1).
 */

export const USER_ROLES = ["player", "admin"] as const;

export const userRoleSchema = z.enum(USER_ROLES);

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters long.")
  .max(30, "Username must be at most 30 characters long.")
  .regex(/^[A-Za-z0-9_]+$/, "Username may only contain letters, numbers and underscores.");

/**
 * Email is normalized before validation so surrounding whitespace and casing
 * never reach the database. The stored value is always lower-case.
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address.").max(255, "Email must be at most 255 characters."));

/** Passwords are intentionally not trimmed; whitespace is significant. */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters long.")
  .max(128, "Password must be at most 128 characters long.");

export const registerSchema = z
  .object({
    username: usernameSchema,
    email: emailSchema,
    password: passwordSchema,
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
  })
  .strict();

export const authUserSchema = z
  .object({
    id: z.number().int().positive(),
    username: z.string().min(1),
    email: z.email(),
    role: userRoleSchema,
    createdAt: z.iso.datetime(),
  })
  .strict();

export const meUserSchema = authUserSchema
  .extend({
    isBanned: z.boolean(),
  })
  .strict();

export const authResponseSchema = z.object({ user: authUserSchema }).strict();

export const meResponseSchema = z.object({ user: meUserSchema }).strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type AuthUserResponse = z.infer<typeof authUserSchema>;
export type MeUserResponse = z.infer<typeof meUserSchema>;
export type UserRole = z.infer<typeof userRoleSchema>;
