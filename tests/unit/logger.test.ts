import { describe, expect, it } from "vitest";

import { createLogger } from "@/lib/logger";

const FIXED_TIME = new Date("2026-01-02T03:04:05.000Z");

function capture() {
  const lines: string[] = [];
  const log = createLogger({
    level: "debug",
    now: () => FIXED_TIME,
    sink: (line) => lines.push(line),
  });

  return {
    log,
    lines,
    entries: () => lines.map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

describe("logger", () => {
  it("writes one JSON line per entry with standard fields", () => {
    const { log, lines, entries } = capture();

    log.info("hello", { userId: 42 });

    expect(lines).toHaveLength(1);
    expect(entries()[0]).toEqual({
      userId: 42,
      ts: "2026-01-02T03:04:05.000Z",
      level: "info",
      msg: "hello",
    });
  });

  it("filters entries below the configured level", () => {
    const lines: string[] = [];
    const log = createLogger({ level: "warn", sink: (line) => lines.push(line) });

    log.debug("debug");
    log.info("info");
    log.warn("warn");
    log.error("error");

    expect(lines).toHaveLength(2);
    expect(lines.map((line) => JSON.parse(line).level)).toEqual(["warn", "error"]);
  });

  it("merges child fields and lets child values override the parent", () => {
    const { log, entries } = capture();
    const child = log.child({ requestId: "req-1", route: "/api/test" });

    child.info("child", { route: "/api/other" });

    expect(entries()[0]).toMatchObject({
      requestId: "req-1",
      route: "/api/other",
      msg: "child",
    });
  });

  it("redacts sensitive fields recursively", () => {
    const { log, lines, entries } = capture();

    log.info("login", {
      password: "hunter2",
      nested: { gameToken: "secret-token", ok: true },
      authorization: "Bearer abc",
      body: { anything: true },
    });

    const serialized = lines[0] ?? "";
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("Bearer abc");

    const entry = entries()[0] as {
      password: string;
      nested: { gameToken: string; ok: boolean };
      authorization: string;
      body: string;
    };
    expect(entry.password).toBe("[REDACTED]");
    expect(entry.nested.gameToken).toBe("[REDACTED]");
    expect(entry.nested.ok).toBe(true);
    expect(entry.authorization).toBe("[REDACTED]");
    expect(entry.body).toBe("[REDACTED]");
  });

  it("serializes Error objects with name, message and stack", () => {
    const { log, entries } = capture();
    const cause = new TypeError("boom");

    log.error("failed", { err: cause });

    expect(entries()[0]?.err).toMatchObject({
      name: "TypeError",
      message: "boom",
    });
    expect((entries()[0]?.err as { stack?: string }).stack).toContain("TypeError");
  });

  it("does not let fields overwrite standard keys", () => {
    const { log, entries } = capture();

    log.info("real message", { msg: "spoofed", level: "debug" });

    expect(entries()[0]).toMatchObject({ msg: "real message", level: "info" });
  });

  it("handles circular objects without throwing", () => {
    const { log, lines } = capture();
    const circular: Record<string, unknown> = { name: "root" };
    circular.self = circular;

    expect(() => log.info("circular", { circular })).not.toThrow();
    expect(lines[0]).toContain("[Circular]");
  });
});
