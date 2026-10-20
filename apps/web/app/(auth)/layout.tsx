import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { AuthTerminal } from "@/features/auth/components/auth-terminal";
import { getServerI18n } from "@/features/i18n/server";
import { trackKeys } from "@/features/track/track-content";
import { TrackMark } from "@/features/track/track-mark";
import { getTrack } from "@/features/track/track-server";
import { cn } from "@/lib/utils";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // The track picked on the public gate (null until then). With one chosen,
  // the whole auth screen is re-themed (data-track tokens, always dark) and
  // the brand mark + secure-session terminal speak that track; without one
  // the original look is untouched.
  const [track, { t }] = await Promise.all([getTrack(), getServerI18n()]);

  return (
    <div
      data-track={track ?? undefined}
      className={cn("grid min-h-svh bg-background text-foreground lg:grid-cols-2", track && "dark")}
    >
      <div className="flex flex-col items-center justify-center gap-8 p-6">
        <div className="flex items-center gap-2.5 text-lg font-semibold">
          {track ? (
            <span className="trk-ring relative inline-grid place-items-center">
              <TrackMark track={track} size={34} animate />
            </span>
          ) : (
            <BrandMark size={32} />
          )}
          Secora AI
        </div>
        {track ? (
          <p className="-mt-4 flex items-center gap-3 border border-dashed border-border px-3 py-1.5 font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
            <span>
              {t("track.auth.badge", { name: t(trackKeys(track).name) })}
            </span>
            <Link href="/" className="text-primary underline underline-offset-4">
              {t("track.auth.change")}
            </Link>
          </p>
        ) : null}
        <div className="w-full max-w-sm">{children}</div>
        {/* Module 15 — task #350 (documentation portal): the only
            logged-out-reachable entry point into /docs — everything else
            that links there lives inside the authenticated sidebar. */}
        <Link href="/docs" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
          Documentation
        </Link>
      </div>
      {/* Decorative "secure session" terminal; large screens only. */}
      <div className="hidden p-6 lg:block">
        <AuthTerminal track={track} />
      </div>
    </div>
  );
}
