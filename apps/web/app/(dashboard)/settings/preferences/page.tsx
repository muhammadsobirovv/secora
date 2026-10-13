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
  const { locale, setLocale, t } = useI18n();

  async function handleThemeChange(theme: Theme) {
    setTheme(theme.toLowerCase());
    try {
      await updatePreferences.mutateAsync({ theme });
    } catch {
      toast.error(t("settings.preferences.themeSaveError"));
    }
  }

  // setLocale already persists the choice (cookie, localStorage and, when
  // signed in, UserPreferences.language), so no second PATCH here.
  function handleLanguageChange(language: Locale) {
    setLocale(language);
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
              <SelectItem value="LIGHT">{t("theme.light")}</SelectItem>
              <SelectItem value="DARK">{t("theme.dark")}</SelectItem>
              <SelectItem value="SYSTEM">{t("theme.system")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label>{t("settings.preferences.language")}</Label>
          <Select value={locale} onValueChange={(v) => handleLanguageChange(v as Locale)}>
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
