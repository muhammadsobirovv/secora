"use client";

import { Bookmark, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";
import { useBookmarks, useDeleteBookmark } from "@/features/bugbounty/hooks/use-bugbounty";

const ENTITY_HREF: Record<string, (id: string) => string> = {
  FINDING: (id) => `/bugbounty/findings/${id}`,
  REPORT: (id) => `/bugbounty/reports/${id}`,
  TARGET: (id) => `/targets/${id}`,
};

export default function BugBountyBookmarksPage() {
  const { data: bookmarks, isLoading } = useBookmarks();
  const deleteBookmark = useDeleteBookmark();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Bookmark className="size-6" /> Bookmarks
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Targets, findings, reports, payloads, and notes you&apos;ve saved.</p>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !bookmarks?.length ? (
        <EmptyState icon={Bookmark} title="No bookmarks yet" />
      ) : (
        <Card>
          <CardContent className="flex flex-col divide-y divide-border p-0">
            {bookmarks.map((bookmark) => {
              const href = ENTITY_HREF[bookmark.entityType]?.(bookmark.entityId);
              return (
                <div key={bookmark.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{bookmark.entityType}</Badge>
                    {href ? (
                      <a href={href} className="font-mono text-xs hover:underline">
                        {bookmark.entityId}
                      </a>
                    ) : (
                      <span className="font-mono text-xs">{bookmark.entityId}</span>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void deleteBookmark.mutateAsync(bookmark.id).then(() => toast.success("Removed"))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
