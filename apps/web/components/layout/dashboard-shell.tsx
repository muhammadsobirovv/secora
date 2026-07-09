"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useKeyboardShortcuts } from "@/lib/hooks/use-keyboard-shortcuts";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { CommandPalette } from "./command-palette";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isHydrated } = useAuth();
  useKeyboardShortcuts();

  React.useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isHydrated, isAuthenticated, router]);

  if (!isHydrated || !isAuthenticated) {
    return (
      <div className="flex h-svh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-svh overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
      <CommandPalette />
    </div>
  );
}
