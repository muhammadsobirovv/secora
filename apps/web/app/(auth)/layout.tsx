import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { AuthTerminal } from "@/features/auth/components/auth-terminal";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-2">
      <div className="flex flex-col items-center justify-center gap-8 p-6">
        <div className="flex items-center gap-2.5 text-lg font-semibold">
          <BrandMark size={32} />
          Secora AI
        </div>
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
        <AuthTerminal />
      </div>
    </div>
  );
}
