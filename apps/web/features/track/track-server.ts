import { cookies } from "next/headers";
import { isTrack, TRACK_COOKIE, type Track } from "./track";

/// Server-component read of the visitor's chosen track (null = not chosen
/// yet). Reading cookies makes the calling layout dynamic, same as locale.
export async function getTrack(): Promise<Track | null> {
  const value = (await cookies()).get(TRACK_COOKIE)?.value;
  return isTrack(value) ? value : null;
}
