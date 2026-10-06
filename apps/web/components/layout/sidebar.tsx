"use client";

import { ShieldCheck, X } from "lucide-react";
import { useUiStore } from "@/lib/stores/ui-store";
import { Button } from "@/components/ui/button";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { NavItem } from "./nav-item";
import { PRIMARY_NAV, FUTURE_NAV, SETTINGS_NAV } from "./nav-config";
import { Separator } from "@/components/ui/separator";

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <div className="flex h-14 items-center gap-2 px-4">
        <ShieldCheck className="size-5 text-primary" />
        <span className="font-semibold">PentestHub AI</span>
      </div>
      <div className="px-2">
        <WorkspaceSwitcher />
      </div>
      <Separator className="my-2" />
      {/* Module 15 — task #349: an unlabeled <nav> is ambiguous for
          screen reader users navigating by landmark when a page has more
          than one (this app also has page-local nav in some feature
          areas) — "Main" distinguishes this one as the primary sidebar. */}
      <nav
        aria-label="Main"
        className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2"
        onClick={onNavigate}
      >
        {PRIMARY_NAV.map((item) => (
          <NavItem key={item.href} item={item} />
        ))}
        <p className="mt-4 mb-1 px-2.5 text-xs font-medium text-muted-foreground/70">Future modules</p>
        {FUTURE_NAV.map((item) => (
          <NavItem key={item.label} item={item} />
        ))}
      </nav>
      <Separator />
      <div className="p-2" onClick={onNavigate}>
        <NavItem item={SETTINGS_NAV} />
      </div>
    </>
  );
}

export function Sidebar() {
  const mobileOpen = useUiStore((s) => s.mobileSidebarOpen);
  const setMobileOpen = useUiStore((s) => s.setMobileSidebarOpen);

  return (
    <>
      {/* Desktop sidebar — always visible, no collapse control. */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar — slide-in drawer with backdrop, only below md. */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-border bg-card">
            <div className="flex justify-end p-2">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close menu"
                onClick={() => setMobileOpen(false)}
              >
                <X className="size-4" />
              </Button>
            </div>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
