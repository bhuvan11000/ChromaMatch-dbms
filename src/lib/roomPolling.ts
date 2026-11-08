import { LOBBY_POLL_MS, ROOM_POLL_MS } from "@/lib/config/constants";

type RoomStatus = "lobby" | "in_progress" | "finished" | "cancelled";

/**
 * Poll interval for `["room", code]`: fast in the lobby, slower during play and
 * stopped (`false`) once the room is finished or cancelled. Unknown status
 * (no data yet) also returns `false`; the first fetch is not a poll.
 */
export function roomPollInterval(status: RoomStatus | undefined): number | false {
  if (status === "lobby") return LOBBY_POLL_MS;
  if (status === "in_progress") return ROOM_POLL_MS;
  return false;
}
