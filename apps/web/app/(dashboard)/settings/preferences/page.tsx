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
import type { Theme } from "@pentesthub/shared";

export default function PreferencesSettingsPage() {
  const { data: preferences, isLoading } = usePreferences();
  const updatePreferences = useUpdatePreferences();
  const { setTheme } = useTheme();

  async function handleThemeChange(theme: Theme) {
    setTheme(theme.toLowerCase());
    try {
      await updatePreferences.mutateAsync({ theme });
    } catch {
      toast.error("Couldn't save theme preference.");
    }
  }

  async function handleTimezoneBlur(timezone: string) {
    if (!timezone || timezone === preferences?.timezone) return;
    try {
      await updatePreferences.mutateAsync({ timezone });
      toast.success("Preferences saved");
    } catch {
      toast.error("Couldn't save preferences.");
    }
  }

  async function handleNotificationsChange(notificationsEnabled: boolean) {
    try {
      await updatePreferences.mutateAsync({ notificationsEnabled });
    } catch {
      toast.error("Couldn't save preferences.");
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
        <CardTitle className="text-base">Preferences</CardTitle>
        <CardDescription>Personalize how PentestHub AI looks and behaves for you.</CardDescription>
      </CardHeader>
      <CardContent className="flex max-w-sm flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label>Theme</Label>
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
          <Label htmlFor="timezone">Timezone</Label>
          <Input
            id="timezone"
            defaultValue={preferences.timezone}
            onBlur={(e) => void handleTimezoneBlur(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="notifications" className="font-normal">
            Email notifications
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
