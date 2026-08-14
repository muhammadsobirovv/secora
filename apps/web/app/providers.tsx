"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionRestorer } from "@/features/auth/hooks/session-restorer";
import { UpdateAvailableBanner } from "@/features/system/components/update-available-banner";
import { I18nProvider } from "@/features/i18n/i18n-context";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
          },
        },
      }),
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      {/* Module 15 — task #348. Deliberately outermost (alongside
          ThemeProvider) and independent of QueryClientProvider — see
          I18nProvider's own doc comment for why it must work for
          logged-out routes too, not just inside SessionRestorer. */}
      <I18nProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider delayDuration={200}>
            {/* Module 14 — Auto Update: outside SessionRestorer so it
                renders for logged-out visitors too. */}
            <UpdateAvailableBanner />
            <SessionRestorer>{children}</SessionRestorer>
            <Toaster position="bottom-right" richColors closeButton />
          </TooltipProvider>
        </QueryClientProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
