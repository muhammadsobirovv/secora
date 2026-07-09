"use client";

import { Menu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUiStore } from "@/lib/stores/ui-store";
import { Breadcrumbs } from "./breadcrumbs";
import { NotificationsStub } from "./notifications-stub";
import { ThemeSwitcher } from "./theme-switcher";
import { UserMenu } from "./user-menu";

export function Header() {
  const setMobileSidebarOpen = useUiStore((s) => s.setMobileSidebarOpen);
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setMobileSidebarOpen(true)}
        aria-label="Open menu"
      >
        <Menu className="size-4" />
      </Button>
      <Breadcrumbs />
      <button
        type="button"
        onClick={() => setCommandPaletteOpen(true)}
        className="ml-auto flex w-full max-w-64 items-center gap-2 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm text-muted-foreground shadow-sm transition-colors hover:bg-accent/50"
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium">
          ⌘K
        </kbd>
      </button>
      <div className="flex items-center gap-1">
        <NotificationsStub />
        <ThemeSwitcher />
        <UserMenu />
      </div>
    </header>
  );
}
