"use client";

import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EmptyState } from "@/components/common/empty-state";
import { useI18n } from "@/features/i18n/i18n-context";

/// Visual stub only — no Notification model or delivery mechanism exists
/// yet (docs/adr/0002-workspace-foundation-module.md, Decision 8). Same
/// "Coming Soon" treatment as the sidebar's future-module entries, just
/// inline in the header.
export function NotificationsStub() {
  const { t } = useI18n();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("header.notifications")}>
          <Bell className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <EmptyState
          icon={Bell}
          title={t("header.notifications.empty.title")}
          description={t("header.notifications.empty.description")}
        />
      </PopoverContent>
    </Popover>
  );
}
