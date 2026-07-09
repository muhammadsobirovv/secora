"use client";

import { Card, CardContent } from "@/components/ui/card";
import { useActivity } from "@/features/activity/hooks/use-activity";
import { ActivityFeed } from "@/features/activity/components/activity-feed";

export default function ActivityPage() {
  const { data, isLoading } = useActivity({ limit: 100 });

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Activity</h1>
        <p className="text-sm text-muted-foreground">
          Everything that&apos;s happened across your workspace.
        </p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <ActivityFeed events={data} isLoading={isLoading} />
        </CardContent>
      </Card>
    </div>
  );
}
