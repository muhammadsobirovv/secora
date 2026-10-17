"use client";

import * as React from "react";
import { ShieldCheck } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useI18n } from "@/features/i18n/i18n-context";

const LINKS = {
  terms: { href: "/legal/terms", labelKey: "legal.nav.terms" },
  aup: { href: "/legal/acceptable-use", labelKey: "legal.nav.aup" },
  privacy: { href: "/legal/privacy", labelKey: "legal.nav.privacy" },
} as const;

/// The legal consent checkbox used at signup and on the "Updated terms"
/// screen. Unchecked by default. The sentence is one translatable string
/// with {terms}/{aup}/{privacy} placeholders, so each language keeps its
/// own word order; the placeholders become links that open in a new tab.
export function LegalConsent({
  id,
  checked,
  onCheckedChange,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const { t } = useI18n();
  const parts = t("legal.consent.text").split(/(\{terms\}|\{aup\}|\{privacy\})/);

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs leading-relaxed text-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <span>{t("legal.consent.notice")}</span>
      </p>
      <div className="flex items-start gap-3">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={(value) => onCheckedChange(value === true)}
          className="mt-0.5"
          aria-describedby={`${id}-text`}
        />
        <label htmlFor={id} id={`${id}-text`} className="text-xs leading-relaxed text-muted-foreground">
          {parts.map((part, i) => {
            const key = part.replace(/[{}]/g, "") as keyof typeof LINKS;
            const link = part.startsWith("{") ? LINKS[key] : undefined;
            if (!link) return <React.Fragment key={i}>{part}</React.Fragment>;
            return (
              <a
                key={i}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground underline underline-offset-2 hover:text-primary"
              >
                {t(link.labelKey)}
              </a>
            );
          })}
        </label>
      </div>
    </div>
  );
}
