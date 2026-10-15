import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { LanguageSwitcher } from "@/features/i18n/language-switcher";
import { ThemeSwitcher } from "@/components/layout/theme-switcher";

/// Shared header of the public docs pages: brand, language switcher and
/// theme switcher (the docs follow the same language choice as the app).
export function DocsHeader() {
  return (
    <header className="border-b border-border/70">
      <div className="mx-auto flex h-16 max-w-4xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold whitespace-nowrap">
          <span className="flex size-7 items-center justify-center rounded-md border border-primary/50 bg-primary/15">
            <ShieldCheck className="size-4 text-primary" />
          </span>
          Secora AI
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeSwitcher />
        </div>
      </div>
    </header>
  );
}
