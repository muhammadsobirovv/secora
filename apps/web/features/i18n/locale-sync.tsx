"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { isSupportedLocale } from "@pentesthub/shared";
import { useAuthStore } from "@/lib/stores/auth-store";
import { getPreferences, updatePreferences } from "@/lib/api/user-preferences";
import { useI18n } from "./i18n-context";
import { PRE_LOGIN_CHOICE_KEY } from "./locale";

/// Carries the language across devices for a signed-in user.
///
/// Once per signed-in user per page load, after the preferences load:
///  - if the visitor explicitly picked a language while signed out in this
///    browser session (flag set by I18nProvider), that fresh choice is
///    pushed to `UserPreferences.language` — otherwise logging in would
///    throw away the language they just chose on the login/landing page;
///  - otherwise the server preference wins: it is adopted into the cookie
///    and localStorage and server components are refreshed. That is how a
///    second browser picks up the language chosen on the first.
export function LocaleSync() {
  const { locale, adoptLocale } = useI18n();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const syncedFor = React.useRef<string | null>(null);

  const { data: preferences } = useQuery({
    queryKey: ["preferences"],
    queryFn: getPreferences,
    enabled: userId !== null,
  });

  React.useEffect(() => {
    if (userId === null) {
      syncedFor.current = null;
      return;
    }
    if (!preferences || syncedFor.current === userId) return;
    syncedFor.current = userId;

    let preLoginChoice = false;
    try {
      preLoginChoice = window.sessionStorage.getItem(PRE_LOGIN_CHOICE_KEY) === "1";
      window.sessionStorage.removeItem(PRE_LOGIN_CHOICE_KEY);
    } catch {
      // storage disabled — treat as no pre-login choice
    }

    if (preLoginChoice) {
      if (preferences.language !== locale) {
        void updatePreferences({ language: locale }).catch(() => undefined);
      }
      return;
    }

    if (isSupportedLocale(preferences.language) && preferences.language !== locale) {
      adoptLocale(preferences.language);
    }
  }, [userId, preferences, locale, adoptLocale]);

  return null;
}
