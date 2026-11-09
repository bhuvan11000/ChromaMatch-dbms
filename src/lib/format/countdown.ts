/**
 * Pure helpers for the Daily "resets in" countdown — Architecture §5.11.4.
 *
 * The countdown is computed from the server-provided `resetsAt`/`serverTime`
 * so a wrong client clock does not skew it: the offset between the server's
 * clock and the client's clock at fetch time is applied to every tick.
 */

/** `serverTime − clientTime` at the moment the response was received. */
export function clockOffsetMs(serverTimeIso: string, clientReceivedAtMs: number): number {
  const server = Date.parse(serverTimeIso);
  return Number.isFinite(server) ? server - clientReceivedAtMs : 0;
}

/** Milliseconds until `resetsAt`, never negative, using the corrected clock. */
export function remainingUntilMs(
  resetsAtIso: string,
  clientNowMs: number,
  offsetMs: number,
): number {
  const resetsAt = Date.parse(resetsAtIso);
  if (!Number.isFinite(resetsAt)) return 0;
  return Math.max(0, resetsAt - (clientNowMs + offsetMs));
}

/** `hh:mm:ss`, rounding up so the display reaches 00:00:00 exactly at zero. */
export function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}
