"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";

const LABELS: Record<string, string> = {
  projects: "Projects",
  targets: "Targets",
  notes: "Notes",
  evidence: "Evidence",
  activity: "Activity",
  workspace: "Workspace",
  settings: "Settings",
  new: "New",
  edit: "Edit",
  profile: "Profile",
  security: "Security",
  sessions: "Sessions",
  "api-keys": "API Keys",
  preferences: "Preferences",
};

function labelFor(segment: string): string {
  if (LABELS[segment]) return LABELS[segment];
  // Looks like an id (uuid-ish) — show a generic label instead of the raw id.
  if (/^[0-9a-f-]{16,}$/i.test(segment)) return "Details";
  return segment;
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  let href = "";
  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground">
      <Link href="/" className="flex items-center hover:text-foreground">
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
