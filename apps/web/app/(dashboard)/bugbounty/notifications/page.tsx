"use client";

import * as React from "react";
import { Bell, CheckCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";
import {
  useBugBountyNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from "@/features/bugbounty/hooks/use-bugbounty";

export default function BugBountyNotificationsPage() {
  const [unreadOnly, setUnreadOnly] = React.useState(false);
  const { data: notifications, isLoading } = useBugBountyNotifications({ unreadOnly });
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Bell className="size-6" /> Notifications
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Deadline reminders and program updates.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setUnreadOnly((v) => !v)}>
            {unreadOnly ? "Show all" : "Unread only"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending}>
            <CheckCheck className="size-4" /> Mark all read
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : !notifications?.length ? (
        <EmptyState icon={Bell} title="No notifications" />
      ) : (
        <Card>
          <CardContent className="flex flex-col divide-y divide-border p-0">
            {notifications.map((n) => (
              <div key={n.id} className={`flex items-center justify-between gap-3 p-3 text-sm ${!n.readAt ? "bg-primary/5" : ""}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{n.title}</p>
                    <Badge variant="outline">{n.type}</Badge>
                  </div>
                  {n.body && <p className="truncate text-xs text-muted-foreground">{n.body}</p>}
                  <p className="text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</p>
                </div>
                {!n.readAt && (
                  <Button size="sm" variant="ghost" onClick={() => markRead.mutate(n.id)} disabled={markRead.isPending}>
                    Mark read
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
