import { describe, expect, it } from "vitest";

import {
  assertValidRequestOrigin,
  isJsonContentType,
  isMutatingMethod,
  normalizeOrigin,
} from "@/lib/auth/origin";
import { AppError } from "@/lib/errors";

const APP_ORIGIN = "http://localhost:3000";

function request(method: string, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/test", {
    method,
    headers,
    ...(isMutatingMethod(method) ? { body: "{}" } : {}),
  });
}

function badOrigin(action: () => void): AppError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    const appError = error as AppError;
    expect(appError.code).toBe("BAD_ORIGIN");
    return appError;
  }
  throw new Error("Expected a BAD_ORIGIN error");
}

describe("origin and content-type helpers", () => {
  it("detects mutating methods case-insensitively", () => {
    expect(isMutatingMethod("POST")).toBe(true);
    expect(isMutatingMethod("post")).toBe(true);
    expect(isMutatingMethod("PATCH")).toBe(true);
    expect(isMutatingMethod("PUT")).toBe(true);
    expect(isMutatingMethod("DELETE")).toBe(true);
    expect(isMutatingMethod("GET")).toBe(false);
    expect(isMutatingMethod("HEAD")).toBe(false);
  });

  it("accepts application/json with parameters only", () => {
    expect(isJsonContentType("application/json")).toBe(true);
    expect(isJsonContentType("Application/JSON; charset=utf-8")).toBe(true);
    expect(isJsonContentType("application/json;charset=utf-8")).toBe(true);
    expect(isJsonContentType("text/plain")).toBe(false);
    expect(isJsonContentType(null)).toBe(false);
  });

  it("normalizes absolute URLs to their origin", () => {
    expect(normalizeOrigin("http://localhost:3000")).toBe("http://localhost:3000");
    expect(normalizeOrigin("http://localhost:3000/rooms/ABCD?x=1")).toBe("http://localhost:3000");
    expect(normalizeOrigin("null")).toBeNull();
    expect(normalizeOrigin("not a url")).toBeNull();
    expect(normalizeOrigin(null)).toBeNull();
  });

  it("does not check safe methods", () => {
    expect(() => assertValidRequestOrigin(request("GET"), APP_ORIGIN)).not.toThrow();
    expect(() => assertValidRequestOrigin(request("HEAD"), APP_ORIGIN)).not.toThrow();
  });

  it("accepts a mutating request with a matching Origin", () => {
    expect(() =>
      assertValidRequestOrigin(
        request("POST", {
          "content-type": "application/json; charset=utf-8",
          origin: APP_ORIGIN,
        }),
        APP_ORIGIN,
      ),
    ).not.toThrow();
  });

  it("falls back to Referer when Origin is absent", () => {
    expect(() =>
      assertValidRequestOrigin(
        request("POST", {
          "content-type": "application/json",
          referer: "http://localhost:3000/rooms/ABCD2345",
        }),
        APP_ORIGIN,
      ),
    ).not.toThrow();
  });

  it("rejects a mutating request without an Origin or Referer", () => {
    const error = badOrigin(() =>
      assertValidRequestOrigin(request("POST", { "content-type": "application/json" }), APP_ORIGIN),
    );
    expect(error.status).toBe(403);
  });

  it("rejects a cross-origin request", () => {
    badOrigin(() =>
      assertValidRequestOrigin(
        request("POST", { "content-type": "application/json", origin: "http://evil.example" }),
        APP_ORIGIN,
      ),
    );
  });

  it("treats a present but malformed Origin as authoritative", () => {
    badOrigin(() =>
      assertValidRequestOrigin(
        request("POST", {
          "content-type": "application/json",
          origin: "null",
          referer: "http://localhost:3000/rooms",
        }),
        APP_ORIGIN,
      ),
    );
  });

  it("rejects a non-JSON content type", () => {
    badOrigin(() =>
      assertValidRequestOrigin(
        request("PATCH", { "content-type": "text/plain", origin: APP_ORIGIN }),
        APP_ORIGIN,
      ),
    );
  });

  it("requires JSON content type even for bodyless DELETE requests", () => {
    expect(() =>
      assertValidRequestOrigin(
        request("DELETE", { "content-type": "application/json", origin: APP_ORIGIN }),
        APP_ORIGIN,
      ),
    ).not.toThrow();

    badOrigin(() =>
      assertValidRequestOrigin(request("DELETE", { origin: APP_ORIGIN }), APP_ORIGIN),
    );
  });
});
