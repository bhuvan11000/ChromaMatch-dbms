import { hash, verify } from "@node-rs/argon2";

/**
 * Password hashing — Architecture §5.5.1 and §5.13.4.
 *
 * Passwords are hashed with argon2id and never stored or logged in plain text.
 * The library defaults are used: argon2id, 19 MiB memory, 2 passes, 32-byte
 * output. (`Algorithm` is a const enum, which cannot be referenced under
 * `isolatedModules`; the default is Argon2id.)
 */

/**
 * A fixed argon2id hash of a random value that is not stored anywhere. It is
 * used only to equalize the cost of a login for an unknown email with the cost
 * of verifying a real account's password. It is not a credential.
 */
const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$9jirVFK3mhuKhEqXrgutTQ$9hGA64tZU56Cfb5hHqTg08eSJ1OMeB/i+nQX2oYD1Fc";

export async function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password);
}

/**
 * Runs a real argon2id verification for a non-existent account. The result is
 * intentionally discarded by the caller so both failure paths behave the same.
 */
export async function verifyDummyPassword(password: string): Promise<boolean> {
  try {
    return await verifyPassword(DUMMY_PASSWORD_HASH, password);
  } catch {
    return false;
  }
}
