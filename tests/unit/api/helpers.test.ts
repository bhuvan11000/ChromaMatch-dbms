import { describe, expect, it } from "vitest";
import { z } from "zod";

import { apiError, json, parseBody } from "@/lib/api";
import { AppError } from "@/lib/errors";

describe("json()", () => {
  it("always sets Cache-Control: no-store", async () => {
    const response = json(
      { ok: true },
      { status: 201, headers: { "Cache-Control": "public, max-age=60" } },
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true });
  });
});

describe("apiError()", () => {
  it("builds the envelope from an AppError", async () => {
    const details = { issues: [{ path: "email", message: "Invalid email" }] };
    const response = apiError(new AppError("VALIDATION_ERROR", "Bad input.", details));

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: "Bad input.", details },
    });
  });

  it("accepts a code and uses the catalog status/message", async () => {
    const response = apiError("SERVICE_UNAVAILABLE");

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: { code: "SERVICE_UNAVAILABLE", message: "The service is temporarily unavailable." },
    });
  });
});

describe("parseBody()", () => {
  const schema = z.object({ name: z.string().min(1) }).strict();

  function bodyRequest(body: string): Request {
    return new Request("http://localhost:3000/api/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
  }

  it("returns parsed and validated data", async () => {
    await expect(parseBody(bodyRequest('{"name":"alice"}'), schema)).resolves.toEqual({
      name: "alice",
    });
  });

  it("throws ZodError for invalid data and unknown keys", async () => {
    await expect(parseBody(bodyRequest('{"name":"","extra":1}'), schema)).rejects.toMatchObject({
      name: "ZodError",
    });
  });

  it("maps malformed JSON to VALIDATION_ERROR", async () => {
    await expect(parseBody(bodyRequest("{not json"), schema)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });
});
