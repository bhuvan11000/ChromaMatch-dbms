import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";
import { ZodError } from "zod";

import { assertValidRequestOrigin } from "@/lib/auth/origin";
import { AppError } from "@/lib/errors";
import { logger as rootLogger, type Logger } from "@/lib/logger";

import { noopRateLimit, type RateLimitHook } from "./rateLimit";
import { apiError } from "./response";

/** Context passed to handlers; it is not part of the Next.js route signature. */
export interface HandlerMeta {
  requestId: string;
  logger: Logger;
}

export type ApiHandler<C = unknown> = (
  request: NextRequest,
  context: C,
  meta: HandlerMeta,
) => Response | Promise<Response>;

export interface HandlerOptions {
  /** Rate-limiting hook; defaults to a no-op (Architecture §5.5.7). */
  rateLimit?: RateLimitHook;
}

function addStandardHeaders(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("x-request-id", requestId);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function validationDetails(error: ZodError): { issues: Array<Record<string, unknown>> } {
  return {
    issues: error.issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
      code: issue.code,
    })),
  };
}

/**
 * Wraps every route handler (Architecture §5.13.1).
 *
 * Responsibilities: Origin/Content-Type check for mutating methods, the
 * rate-limit hook, AppError/ZodError/unknown-error mapping, request ids, and
 * `Cache-Control: no-store`.
 */
export function withHandler<C = unknown>(
  handler: ApiHandler<C>,
  options: HandlerOptions = {},
): (request: NextRequest, context: C) => Promise<Response> {
  const rateLimit = options.rateLimit ?? noopRateLimit;

  return async function routeHandler(request: NextRequest, context: C): Promise<Response> {
    const requestId = randomUUID();
    const startedAt = performance.now();
    const route = new URL(request.url).pathname;
    const requestLogger = rootLogger.child({
      requestId,
      route,
      method: request.method,
    });
    const durationMs = (): number => Math.round((performance.now() - startedAt) * 10) / 10;

    try {
      assertValidRequestOrigin(request);
      await rateLimit(request, { requestId, route, method: request.method });

      const response = await handler(request, context, { requestId, logger: requestLogger });
      const finalResponse = addStandardHeaders(response, requestId);

      requestLogger.debug("request_completed", {
        status: finalResponse.status,
        durationMs: durationMs(),
      });

      return finalResponse;
    } catch (error) {
      if (error instanceof ZodError) {
        requestLogger.warn("request_validation_failed", {
          status: 400,
          code: "VALIDATION_ERROR",
          durationMs: durationMs(),
        });
        return addStandardHeaders(
          apiError("VALIDATION_ERROR", "The request is invalid.", validationDetails(error)),
          requestId,
        );
      }

      if (error instanceof AppError) {
        const fields = {
          status: error.status,
          code: error.code,
          durationMs: durationMs(),
        };
        if (error.status >= 500) {
          requestLogger.error("request_failed", fields);
        } else {
          requestLogger.warn("request_failed", fields);
        }
        return addStandardHeaders(apiError(error), requestId);
      }

      // Unexpected error: log it server-side, return a generic message only.
      requestLogger.error("request_failed", {
        status: 500,
        code: "INTERNAL_ERROR",
        durationMs: durationMs(),
        err: error,
      });
      return addStandardHeaders(apiError("INTERNAL_ERROR"), requestId);
    }
  };
}
