import { describe, expect, it } from "vitest";

import { clockOffsetMs, formatCountdown, remainingUntilMs } from "@/lib/format/countdown";

describe("formatCountdown", () => {
  it("formats hh:mm:ss with zero padding", () => {
    expect(formatCountdown(0)).toBe("00:00:00");
    expect(formatCountdown(1000)).toBe("00:00:01");
    expect(formatCountdown(61_000)).toBe("00:01:01");
    expect(formatCountdown(3_661_000)).toBe("01:01:01");
    expect(formatCountdown(23 * 3_600_000 + 59 * 60_000 + 59_000)).toBe("23:59:59");
  });

  it("rounds partial seconds up and clamps negatives", () => {
    expect(formatCountdown(1)).toBe("00:00:01");
    expect(formatCountdown(999)).toBe("00:00:01");
    expect(formatCountdown(-5000)).toBe("00:00:00");
  });
});

describe("clock offset correction", () => {
  it("applies the server/client offset to the remaining time", () => {
    const serverTime = "2026-10-29T23:00:00.000Z";
    const clientReceivedAt = Date.parse("2026-10-29T22:00:00.000Z"); // client 1h behind
    const offset = clockOffsetMs(serverTime, clientReceivedAt);

    expect(offset).toBe(3_600_000);

    // 30 s later on the client clock, the server is 30 s further along too.
    const clientNow = clientReceivedAt + 30_000;
    expect(remainingUntilMs("2026-10-30T00:00:00.000Z", clientNow, offset)).toBe(
      3_600_000 - 30_000,
    );
  });

  it("never returns a negative remaining time and tolerates bad input", () => {
    expect(remainingUntilMs("2026-10-30T00:00:00.000Z", Date.parse("2026-10-31T00:00:00Z"), 0)).toBe(0);
    expect(remainingUntilMs("not-a-date", 0, 0)).toBe(0);
    expect(clockOffsetMs("not-a-date", 123)).toBe(0);
  });
});
