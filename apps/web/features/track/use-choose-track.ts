"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { TRACK_INTRO_KEY, writeTrackCookie, type Track } from "./track";

/// Records the visitor's track (cookie) and opens its page. `intro` asks the
/// track page to play the brand intro once; switching tracks from inside a
/// track page skips it.
export function useChooseTrack(): (track: Track, options?: { intro?: boolean }) => void {
  const router = useRouter();
  return React.useCallback(
    (track, options) => {
      writeTrackCookie(track);
      if (options?.intro) {
        try {
          sessionStorage.setItem(TRACK_INTRO_KEY, "1");
        } catch {
          // Storage can be blocked; the intro is a nicety, so just skip it.
        }
      }
      router.push(`/${track}`);
    },
    [router],
  );
}
