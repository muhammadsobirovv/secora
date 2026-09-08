"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const SETTINGS_NAV = [
  { label: "Profile", href: "/settings/profile" },
  { label: "Security", href: "/settings/security" },
  { label: "Sessions", href: "/settings/sessions" },
  { label: "API Keys", href: "/settings/api-keys" },
  { label: "AI Providers", href: "/settings/ai-providers" },
  { label: "Preferences", href: "/settings/preferences" },
  { label: "Workspace", href: "/settings/workspace" },
  // Module 19 — task #332. Organization-scoped; see BillingSummarySection
  // for the "no organization yet" (Community Edition) state.
  { label: "Billing", href: "/settings/billing" },
  { label: "Usage", href: "/settings/usage" },
  // Module 15 — task #353.
  { label: "Diagnostics", href: "/settings/diagnostics" },
  // Module 15 — task #355.
  { label: "Support", href: "/settings/support" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[180px_1fr]">
        <nav className="flex gap-1 overflow-x-auto md:flex-col">
          {SETTINGS_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                pathname === item.href
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
