import { NextResponse } from "next/server";

import { AppError, type ErrorCode } from "@/lib/errors";

/** Standard error envelope — Architecture §5.10.1. */
export interface ApiErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

/** JSON response with the mandatory `Cache-Control: no-store` header. */
export function json<T>(data: T, init?: ResponseInit): NextResponse {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return NextResponse.json(data, { ...init, headers });
}

/** Builds a standard error envelope from an AppError (or a code). */
export function apiError(error: AppError): NextResponse;
export function apiError(code: ErrorCode, message?: string, details?: unknown): NextResponse;
export function apiError(
  errorOrCode: AppError | ErrorCode,
  message?: string,
  details?: unknown,
): NextResponse {
  const error =
    errorOrCode instanceof AppError ? errorOrCode : new AppError(errorOrCode, message, details);

  const envelope: ApiErrorEnvelope = {
    error: { code: error.code, message: error.message },
  };
  if (error.details !== undefined) {
    envelope.error.details = error.details;
  }

  return json(envelope, { status: error.status });
}
