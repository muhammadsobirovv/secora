"use client";

import * as React from "react";
import { MessageSquarePlus, Pin, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  useAiConversations,
  useCreateAiConversation,
  useDeleteAiConversation,
  usePinAiConversation,
} from "../hooks/use-ai";

/// Conversation History + Conversation Search (AI Dashboard spec).
export function AiConversationSidebar({
  projectId,
  activeConversationId,
  onSelect,
}: {
  projectId: string;
  activeConversationId: string | null;
  onSelect: (conversationId: string) => void;
}) {
  const [search, setSearch] = React.useState("");
  const { data: conversations, isLoading } = useAiConversations(projectId);
  const createConversation = useCreateAiConversation();
  const deleteConversation = useDeleteAiConversation();
  const pinConversation = usePinAiConversation();

  const filtered = (conversations ?? []).filter((c) =>
    search ? (c.title ?? "New conversation").toLowerCase().includes(search.toLowerCase()) : true,
  );

  const handleCreate = async () => {
    const conversation = await createConversation.mutateAsync({ projectId });
    onSelect(conversation.id);
  };

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-r">
      <div className="flex items-center gap-2 p-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations..."
            className="h-8 pl-8 text-sm"
          />
        </div>
        <Button type="button" size="icon" variant="outline" className="size-8 shrink-0" onClick={handleCreate} aria-label="New conversation">
          <MessageSquarePlus className="size-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">No conversations yet.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {filtered.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onSelect(conversation.id)}
                className={cn(
                  "group flex flex-col gap-0.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted",
                  activeConversationId === conversation.id && "bg-muted",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1 truncate font-medium">
                    {conversation.pinned && <Pin className="size-3 shrink-0 text-primary" />}
                    {conversation.title ?? "New conversation"}
                  </span>
                  <span className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        pinConversation.mutate({ id: conversation.id, value: !conversation.pinned });
                      }}
                      aria-label="Pin conversation"
                    >
                      <Pin className="size-3" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteConversation.mutate(conversation.id);
                        if (activeConversationId === conversation.id) onSelect("");
                      }}
                      aria-label="Delete conversation"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </span>
                </div>
                {conversation.lastMessagePreview && (
                  <span className="truncate text-xs text-muted-foreground">{conversation.lastMessagePreview}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
