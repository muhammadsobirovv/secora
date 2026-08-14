"use client";

import { toast } from "sonner";
import { useTheme } from "next-themes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { usePreferences, useUpdatePreferences } from "@/features/settings/hooks/use-preferences";
import { useI18n } from "@/features/i18n/i18n-context";
import { LOCALE_LABELS, SUPPORTED_LOCALES, type Locale, type Theme } from "@pentesthub/shared";

export default function PreferencesSettingsPage() {
  const { data: preferences, isLoading } = usePreferences();
  const updatePreferences = useUpdatePreferences();
  const { setTheme } = useTheme();
  // Module 15 — task #348. `t()` demonstrates this page reading from the
  // i18n catalog for its own copy; `setLocale` is this page's write path
  // into the i18n architecture, mirroring `setTheme` for the theme
  // preference right below it. Full-page string extraction beyond these
  // labels is out of scope for this task — see docs/architecture/i18n.md.
  const { locale, setLocale, t } = useI18n();

  async function handleThemeChange(theme: Theme) {
    setTheme(theme.toLowerCase());
    try {
      await updatePreferences.mutateAsync({ theme });
    } catch {
      toast.error("Couldn't save theme preference.");
    }
  }

  async function handleLanguageChange(language: Locale) {
    setLocale(language);
    try {
      await updatePreferences.mutateAsync({ language });
    } catch {
      toast.error(t("settings.preferences.saveError"));
    }
  }

  async function handleTimezoneBlur(timezone: string) {
    if (!timezone || timezone === preferences?.timezone) return;
    try {
      await updatePreferences.mutateAsync({ timezone });
      toast.success(t("settings.preferences.saved"));
    } catch {
      toast.error(t("settings.preferences.saveError"));
    }
  }

  async function handleNotificationsChange(notificationsEnabled: boolean) {
    try {
      await updatePreferences.mutateAsync({ notificationsEnabled });
    } catch {
      toast.error(t("settings.preferences.saveError"));
    }
  }

  if (isLoading || !preferences) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("settings.preferences.title")}</CardTitle>
        <CardDescription>{t("settings.preferences.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex max-w-sm flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label>{t("settings.preferences.theme")}</Label>
          <Select value={preferences.theme} onValueChange={(v) => void handleThemeChange(v as Theme)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="LIGHT">Light</SelectItem>
              <SelectItem value="DARK">Dark</SelectItem>
              <SelectItem value="SYSTEM">System</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label>{t("settings.preferences.language")}</Label>
          {/* Module 15 — task #348. Value comes from local i18n state
              (updated instantly on change) rather than `preferences.language`
              directly, so switching languages doesn't wait on the
              mutation's round-trip before the UI reflects the choice. */}
          <Select value={locale} onValueChange={(v) => void handleLanguageChange(v as Locale)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_LOCALES.map((code) => (
                <SelectItem key={code} value={code}>
                  {LOCALE_LABELS[code]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="timezone">{t("settings.preferences.timezone")}</Label>
          <Input
            id="timezone"
            defaultValue={preferences.timezone}
            onBlur={(e) => void handleTimezoneBlur(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="notifications" className="font-normal">
            {t("settings.preferences.notifications")}
          </Label>
          <Switch
            id="notifications"
            checked={preferences.notificationsEnabled}
            onCheckedChange={(checked) => void handleNotificationsChange(checked)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
