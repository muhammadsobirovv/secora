"use client";

import { Globe } from "lucide-react";
import { SUPPORTED_LOCALES, LOCALE_LABELS, type Locale } from "@pentesthub/shared";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "./i18n-context";

const LOCALE_SHORT: Record<Locale, string> = { en: "EN", uz: "UZ", ru: "RU" };

/// A visible, one-click language switcher — previously the only way to
/// change language was to navigate into Settings > Preferences. Dropped
/// into the dashboard header and the public marketing page so switching
/// is discoverable from anywhere, not just buried in settings.
export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={className} aria-label={t("language.label")}>
          <Globe className="size-4" />
          <span className="text-xs font-medium">{LOCALE_SHORT[locale]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {SUPPORTED_LOCALES.map((loc) => (
          <DropdownMenuItem key={loc} onSelect={() => setLocale(loc)} className={loc === locale ? "font-semibold" : undefined}>
            {LOCALE_LABELS[loc]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
