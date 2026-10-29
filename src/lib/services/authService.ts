import { hashPassword, verifyDummyPassword, verifyPassword } from "@/lib/auth/password";
import { BANNED_CAN_PLAY } from "@/lib/config/constants";
import {
  findByEmail,
  findById,
  insertUser,
  type PublicUserRecord,
} from "@/lib/db/pg/queries/users";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type {
  AuthUserResponse,
  LoginInput,
  MeUserResponse,
  RegisterInput,
} from "@/lib/schemas/auth";

/**
 * Authentication use-cases — Architecture §5.7.1.
 *
 * Services receive plain values and return public DTOs. Password hashes never
 * leave the data layer except into the login comparison below, and are never
 * returned or logged.
 */

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toAuthUser(user: PublicUserRecord): AuthUserResponse {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function register(input: RegisterInput): Promise<AuthUserResponse> {
  const passwordHash = await hashPassword(input.password);

  const user = await insertUser({
    username: input.username.trim(),
    email: normalizeEmail(input.email),
    passwordHash,
  });

  return toAuthUser(user);
}

export async function login(input: LoginInput): Promise<AuthUserResponse> {
  const email = normalizeEmail(input.email);
  const user = await findByEmail(email);

  if (!user) {
    // Equalize timing with a real argon2 verification before failing. The
    // result is intentionally discarded; both failure paths return the same
    // INVALID_CREDENTIALS error.
    await verifyDummyPassword(input.password);
    logger.warn("login_failed", { email, reason: "unknown_email" });
    throw new AppError("INVALID_CREDENTIALS");
  }

  let validPassword = false;
  try {
    validPassword = await verifyPassword(user.passwordHash, input.password);
  } catch {
    // A corrupt stored hash must fail closed, not leak details.
    validPassword = false;
  }

  if (!validPassword) {
    logger.warn("login_failed", { email, userId: user.id, reason: "invalid_password" });
    throw new AppError("INVALID_CREDENTIALS");
  }

  if (!BANNED_CAN_PLAY && user.isBanned) {
    throw new AppError("FORBIDDEN", "This account is banned.");
  }

  return toAuthUser(user);
}

export async function getMe(userId: number): Promise<MeUserResponse> {
  const user = await findById(userId);

  if (!user) {
    // The session may outlive a deleted account; treat it as unauthenticated.
    throw new AppError("UNAUTHENTICATED");
  }

  return {
    ...toAuthUser(user),
    isBanned: user.isBanned,
  };
}
