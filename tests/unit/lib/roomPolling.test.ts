import { describe, expect, it } from "vitest";

import { LOBBY_POLL_MS, ROOM_POLL_MS } from "@/lib/config/constants";
import { roomPollInterval } from "@/lib/roomPolling";

describe("roomPollInterval", () => {
  it("polls the lobby fast and in-progress rooms slower", () => {
    expect(roomPollInterval("lobby")).toBe(LOBBY_POLL_MS);
    expect(roomPollInterval("in_progress")).toBe(ROOM_POLL_MS);
    expect(LOBBY_POLL_MS).toBeLessThan(ROOM_POLL_MS);
  });

  it("stops polling for finished, cancelled and unknown rooms", () => {
    expect(roomPollInterval("finished")).toBe(false);
    expect(roomPollInterval("cancelled")).toBe(false);
    expect(roomPollInterval(undefined)).toBe(false);
  });
});
