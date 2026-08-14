import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 bg-background p-6">
      <div className="flex items-center gap-2 text-lg font-semibold">
        <ShieldCheck className="size-6 text-primary" />
        PentestHub AI
      </div>
      <div className="w-full max-w-sm">{children}</div>
      {/* Module 15 — task #350 (documentation portal): the only
          logged-out-reachable entry point into /docs — everything else
          that links there lives inside the authenticated sidebar. */}
      <Link href="/docs" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
        Documentation
      </Link>
    </div>
  );
}
