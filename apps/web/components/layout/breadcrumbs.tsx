"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import { useI18n } from "@/features/i18n/i18n-context";
import type { MessageKey } from "@/features/i18n/i18n-context";

// URL segment -> catalog key. Segments not listed here are shown as-is
// (they are usually ids or proper nouns the user typed).
const LABEL_KEYS: Record<string, MessageKey> = {
  dashboard: "nav.dashboard",
  projects: "nav.projects",
  targets: "nav.targets",
  notes: "nav.notes",
  evidence: "nav.evidence",
  activity: "nav.activity",
  workspace: "nav.workspace",
  settings: "nav.settings",
  new: "breadcrumb.new",
  edit: "breadcrumb.edit",
  profile: "breadcrumb.profile",
  security: "breadcrumb.security",
  sessions: "breadcrumb.sessions",
  "api-keys": "breadcrumb.apiKeys",
  preferences: "breadcrumb.preferences",
};

export function Breadcrumbs() {
  const pathname = usePathname();
  const { t } = useI18n();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  function labelFor(segment: string): string {
    const key = LABEL_KEYS[segment];
    if (key) return t(key);
    // Looks like an id (uuid-ish) — show a generic label instead of the raw id.
    if (/^[0-9a-f-]{16,}$/i.test(segment)) return t("breadcrumb.details");
    return segment;
  }

  let href = "";
  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground">
      <Link href="/dashboard" className="flex items-center hover:text-foreground">
        <Home className="size-3.5" />
      </Link>
      {segments.map((segment, i) => {
        href += `/${segment}`;
        const isLast = i === segments.length - 1;
        return (
          <span key={href} className="flex items-center gap-1">
            <ChevronRight className="size-3.5" />
            {isLast ? (
              <span className="font-medium text-foreground">{labelFor(segment)}</span>
            ) : (
              <Link href={href} className="hover:text-foreground">
                {labelFor(segment)}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
