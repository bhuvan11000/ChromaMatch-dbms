import type { z } from "zod";

/**
 * Parses and validates query parameters with a strict Zod schema.
 *
 * Repeated parameters keep their last value, matching URLSearchParams.get().
 * Schema failures throw a ZodError that `withHandler` maps to VALIDATION_ERROR.
 */
export function parseQuery<T>(request: Request, schema: z.ZodType<T>): T {
  const values: Record<string, string> = {};

  for (const [key, value] of new URL(request.url).searchParams) {
    values[key] = value;
  }

  return schema.parse(values);
}
