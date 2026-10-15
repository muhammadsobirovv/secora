"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { LEGAL_EFFECTIVE_DATE, LEGAL_VERSION } from "@pentesthub/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LanguageSwitcher } from "@/features/i18n/language-switcher";
import { useI18n } from "@/features/i18n/i18n-context";
import { useAuth } from "@/features/auth/hooks/use-auth";
import * as legalApi from "@/lib/api/legal";
import { LegalConsent } from "./legal-consent";
import { LEGAL_LINKS } from "./legal-document-view";

/// Only same-origin paths are honored for ?next=, so this screen can't be
/// abused as an open redirect.
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/legal/accept")) {
    return "/dashboard";
  }
  return raw;
}

/// Blocking "Updated terms" screen. The API answers 403
/// LEGAL_ACCEPTANCE_REQUIRED on every gated route until the user accepts
/// the current LEGAL_VERSION; lib/api/client.ts redirects here when it
/// sees that response. Also the first screen after an OAuth signup, since
/// those accounts were created without the signup form's checkbox.
export function LegalAcceptScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { isHydrated, isAuthenticated, logout } = useAuth();
  const [checked, setChecked] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const next = safeNext(searchParams.get("next"));

  React.useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      router.replace(`/login?next=${encodeURIComponent(`/legal/accept?next=${next}`)}`);
    }
  }, [isHydrated, isAuthenticated, next, router]);

  async function onAccept() {
    if (!checked) return;
    setSubmitting(true);
    try {
      const status = await legalApi.acceptLegal({ version: LEGAL_VERSION });
      // DashboardShell reads this cached status; refresh it so it does not
      // bounce the user straight back here.
      queryClient.setQueryData(["legal-status"], status);
      router.replace(next);
    } catch {
      toast.error(t("legal.accept.error"));
      setSubmitting(false);
    }
  }

  async function onSignOut() {
    await logout();
    router.replace("/login");
  }

  const versionLine = t("legal.versionLine")
    .replace("{version}", LEGAL_VERSION)
    .replace("{date}", LEGAL_EFFECTIVE_DATE);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-4 py-10">
      <div className="mb-6 flex w-full max-w-lg items-center justify-between">
        <span className="flex items-center gap-2 font-semibold">
          <span className="flex size-7 items-center justify-center rounded-md border border-primary/50 bg-primary/15">
            <ShieldCheck className="size-4 text-primary" />
          </span>
          Secora AI
        </span>
        <LanguageSwitcher />
      </div>
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>{t("legal.accept.title")}</CardTitle>
          <CardDescription>{t("legal.accept.body").replace("{versionLine}", versionLine)}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {LEGAL_LINKS.filter((link) => link.kind !== "security").map((link) => (
              <li key={link.kind}>
                <Link href={link.href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  {t(link.labelKey)}
                </Link>
              </li>
            ))}
          </ul>
          <LegalConsent id="legal-accept" checked={checked} onCheckedChange={setChecked} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button variant="ghost" onClick={onSignOut} disabled={submitting}>
              {t("legal.accept.signOut")}
            </Button>
            <Button onClick={onAccept} disabled={!checked || submitting || !isAuthenticated}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {t("legal.accept.button")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
