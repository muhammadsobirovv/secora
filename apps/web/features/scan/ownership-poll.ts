/// While the "prove you own it" page is open it re-checks by itself, so a user
/// who has just added the DNS record does not have to come back and press a
/// button. The pace is fixed: never faster than every 30 seconds (the server
/// also refuses anything quicker), for at most 30 minutes, then the user takes
/// over with a manual "Check again".
export const OWNERSHIP_POLL_INTERVAL_MS = 30_000;
export const OWNERSHIP_POLL_MAX_MS = 30 * 60_000;

export type PollDecision = "wait" | "check" | "stop";

/// What the poller should do now. `elapsedMs` counts from when the page opened.
/// `sinceLastCheckMs` is the time since the last check of any kind (automatic
/// or manual), so pressing "Check now" resets the clock instead of doubling up.
export function pollDecision(input: { elapsedMs: number; sinceLastCheckMs: number; busy: boolean }): PollDecision {
  if (input.elapsedMs >= OWNERSHIP_POLL_MAX_MS) return "stop";
  if (input.busy) return "wait";
  return input.sinceLastCheckMs >= OWNERSHIP_POLL_INTERVAL_MS ? "check" : "wait";
}

/// Seconds until the next automatic check, for the "next check in N s" hint.
export function secondsToNextCheck(sinceLastCheckMs: number): number {
  return Math.max(0, Math.ceil((OWNERSHIP_POLL_INTERVAL_MS - sinceLastCheckMs) / 1000));
}
