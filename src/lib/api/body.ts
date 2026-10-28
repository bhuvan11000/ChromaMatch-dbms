import { z } from "zod";

import { AppError } from "@/lib/errors";

/**
 * Parses and validates a JSON request body.
 *
 * Malformed or empty JSON becomes `VALIDATION_ERROR`; schema failures throw a
 * `ZodError` that `withHandler` converts into a 400 with issue details.
 */
export async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new AppError("VALIDATION_ERROR", "Request body must be valid JSON.");
  }

  return schema.parse(body);
}
