import Link from "next/link";
import { formatDistanceToNow } from "@/lib/format";
import { Activity as ActivityIcon, FileText, FolderKanban, ImageIcon, Paperclip, Target } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { ListSkeleton } from "@/components/common/skeletons";
import type { ActivityEventDto } from "@pentesthub/shared";

const ENTITY_ICON: Record<string, typeof FolderKanban> = {
  Project: FolderKanban,
  Target: Target,
  Note: FileText,
  Evidence: ImageIcon,
  Attachment: Paperclip,
  Workspace: FolderKanban,
};

const ENTITY_HREF: Record<string, (id: string) => string> = {
  Project: (id) => `/projects/${id}`,
  Target: (id) => `/targets/${id}`,
  Note: (id) => `/notes/${id}`,
  Evidence: (id) => `/evidence/${id}`,
};

function verbToSentence(verb: string): string {
  const [entity, action] = verb.split(".");
  const readableEntity = entity ?? "item";
  const readableAction = (action ?? "updated").replace(/_/g, " ");
  return `${readableEntity} ${readableAction}`;
}

export function ActivityFeed({
  events,
  isLoading,
}: {
  events: ActivityEventDto[] | undefined;
  isLoading: boolean;
}) {
  if (isLoading) return <ListSkeleton rows={6} />;

  if (!events || events.length === 0) {
    return (
      <EmptyState
        icon={ActivityIcon}
        title="No activity yet"
        description="Actions across your projects will show up here as they happen."
      />
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {events.map((event) => {
        const Icon = ENTITY_ICON[event.entityType] ?? ActivityIcon;
        const href = ENTITY_HREF[event.entityType]?.(event.entityId);
        const content = (
          <div className="flex items-center gap-3 py-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
              <Icon className="size-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm capitalize">{verbToSentence(event.verb)}</p>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatDistanceToNow(event.createdAt)}
            </span>
          </div>
        );
        return (
          <li key={event.id}>
            {href ? (
              <Link href={href} className="block hover:bg-accent/40 rounded-md px-2 -mx-2">
                {content}
              </Link>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ul>
  );
}
