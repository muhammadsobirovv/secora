"use client";

import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EmptyState } from "@/components/common/empty-state";

/// Visual stub only — no Notification model or delivery mechanism exists
/// yet (docs/adr/0002-workspace-foundation-module.md, Decision 8). Same
/// "Coming Soon" treatment as the sidebar's future-module entries, just
/// inline in the header.
export function NotificationsStub() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications">
          <Bell className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <EmptyState
          icon={Bell}
          title="No notifications yet"
          description="We'll let you know when something needs your attention."
        />
      </PopoverContent>
    </Popover>
  );
}
