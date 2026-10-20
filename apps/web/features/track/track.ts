/// The visitor's chosen "track": offensive (red team) or defensive (blue
/// team). One choice on the public gate colors and words everything after it
/// (track pages, login/register). It is only a presentation preference, never
/// an authorization input, so a plain readable cookie is the right storage:
/// the server layouts read it to render the right theme on the first paint.
export type Track = "red" | "blue";

export const TRACKS: readonly Track[] = ["blue", "red"];

export const TRACK_COOKIE = "secora.track";
export const TRACK_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/// sessionStorage flag set by the gate so the brand intro plays once, right
/// after a choice, and not on every later visit to the track page.
export const TRACK_INTRO_KEY = "secora.track.intro";

export function isTrack(value: unknown): value is Track {
  return value === "red" || value === "blue";
}

export function otherTrack(track: Track): Track {
  return track === "red" ? "blue" : "red";
}

export function writeTrackCookie(track: Track): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${encodeURIComponent(TRACK_COOKIE)}=${track}; Path=/; ` +
    `Max-Age=${TRACK_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

/// Accent colors for canvas drawing (CSS variables are not available there).
export const TRACK_COLOR: Record<Track, string> = {
  red: "#ff2a3d",
  blue: "#2aa7ff",
};
