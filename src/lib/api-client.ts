import type { ZodType } from "zod";

import { ERROR_MESSAGES, ERROR_STATUS, type ErrorCode } from "@/lib/errors";
import type { ApiErrorBody } from "@/types/api";

/**
 * Browser HTTP client — Architecture §5.10, §5.11.4.
 *
 * Components and hooks must use this module instead of calling `fetch`
 * directly. It centralises the API base path, JSON headers, credentials, the
 * standard error envelope, and abort handling.
 */

const API_BASE = "/api";

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue>;

export interface ApiRequestOptions<T = unknown> {
  method?: HttpMethod;
  body?: unknown;
  query?: QueryParams;
  schema?: ZodType<T>;
  signal?: AbortSignal;
  headers?: HeadersInit;
}

export type ApiReadOptions<T = unknown> = Omit<ApiRequestOptions<T>, "method" | "body">;

export interface ApiErrorInit {
  code: ErrorCode;
  status: number;
  message: string;
  details?: unknown;
}

/** Typed client-side error for failed API requests. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor({ code, status, message, details }: ApiErrorInit) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && Object.hasOwn(ERROR_STATUS, value);
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (value === null || typeof value !== "object") return false;

  const error = (value as { error?: unknown }).error;
  if (error === null || typeof error !== "object") return false;

  return typeof (error as { message?: unknown }).message === "string";
}

function fallbackCodeForStatus(status: number): ErrorCode {
  if (status === 400) return "VALIDATION_ERROR";
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 403) return "FORBIDDEN";
  if (status === 429) return "RATE_LIMITED";
  if (status === 503) return "SERVICE_UNAVAILABLE";
  return "INTERNAL_ERROR";
}

function buildApiUrl(path: string, query?: QueryParams): string {
  const withSlash = path.startsWith("/") ? path : `/${path}`;
  const apiPath =
    withSlash === "/api" || withSlash.startsWith("/api/") ? withSlash : `${API_BASE}${withSlash}`;

  const search = new URLSearchParams();
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === null || value === undefined) continue;
      search.set(key, String(value));
    }
  }

  const queryString = search.toString();
  return queryString ? `${apiPath}?${queryString}` : apiPath;
}

async function parseResponse<T>(response: Response, schema?: ZodType<T>): Promise<T> {
  const raw = await response.text();
  let payload: unknown;

  if (raw.length > 0) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = undefined;
    }
  }

  if (!response.ok) {
    const envelope = isApiErrorBody(payload) ? payload : undefined;
    const code =
      envelope && isErrorCode(envelope.error.code)
        ? envelope.error.code
        : fallbackCodeForStatus(response.status);

    throw new ApiError({
      code,
      status: response.status,
      message: envelope?.error.message ?? ERROR_MESSAGES[code],
      details: envelope?.error.details,
    });
  }

  if (response.status === 204 || raw.length === 0) {
    return undefined as T;
  }

  if (payload === undefined) {
    throw new ApiError({
      code: "INTERNAL_ERROR",
      status: 500,
      message: "The server returned an unreadable response.",
    });
  }

  if (schema) {
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new ApiError({
        code: "INTERNAL_ERROR",
        status: 500,
        message: "The server returned an unexpected response.",
      });
    }
    return parsed.data;
  }

  return payload as T;
}

/** Low-level typed request. Prefer the `apiClient` helpers below. */
export async function request<T = unknown>(
  path: string,
  options: ApiRequestOptions<T> = {},
): Promise<T> {
  const method = options.method ?? "GET";
  const hasBody = options.body !== undefined;

  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (method !== "GET") {
    // Also set for bodyless mutations (logout): the server's Origin/CSRF guard
    // requires Content-Type: application/json on every mutating request.
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(buildApiUrl(path, options.query), {
      method,
      headers,
      body: hasBody ? JSON.stringify(options.body) : undefined,
      credentials: "include",
      cache: "no-store",
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;

    throw new ApiError({
      code: "SERVICE_UNAVAILABLE",
      status: 503,
      message: "Could not reach the server. Please check your connection and try again.",
    });
  }

  return parseResponse(response, options.schema);
}

export const apiClient = {
  get<T = unknown>(path: string, options: ApiReadOptions<T> = {}): Promise<T> {
    return request<T>(path, { ...options, method: "GET" });
  },

  post<T = unknown>(path: string, body?: unknown, options: ApiReadOptions<T> = {}): Promise<T> {
    return request<T>(path, { ...options, method: "POST", body });
  },

  patch<T = unknown>(path: string, body?: unknown, options: ApiReadOptions<T> = {}): Promise<T> {
    return request<T>(path, { ...options, method: "PATCH", body });
  },

  put<T = unknown>(path: string, body?: unknown, options: ApiReadOptions<T> = {}): Promise<T> {
    return request<T>(path, { ...options, method: "PUT", body });
  },

  delete<T = unknown>(path: string, options: ApiReadOptions<T> = {}): Promise<T> {
    return request<T>(path, { ...options, method: "DELETE" });
  },
};
