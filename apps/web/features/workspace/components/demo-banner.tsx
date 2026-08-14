"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useWorkspace } from "../hooks/use-workspace";

/// Module 15 — task #352 (demo mode). A thin, persistent strip shown
/// only when the active workspace was created by POST /demo/session
/// (`WorkspaceDto.isDemo`) — everyone else never renders this at all.
/// Explains, in one line, the two things a demo visitor needs to know
/// that aren't otherwise obvious: the data is sample data, and new scans
/// are intentionally disabled (see `CreateReconJobHandler`'s
/// `DEMO_WORKSPACE_READ_ONLY` guard).
export function DemoBanner() {
  const { data: workspace } = useWorkspace();

  if (!workspace?.isDemo) return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-primary/10 px-4 py-1.5 text-center text-xs text-primary">
      <Sparkles className="size-3.5 shrink-0" aria-hidden="true" />
      <span>
        You&apos;re exploring a demo workspace with sample data — new scans are disabled.{" "}
        <Link href="/register" className="font-medium underline underline-offset-2">
          Create a free account
        </Link>{" "}
        to run real ones.
      </span>
    </div>
  );
}
