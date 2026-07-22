import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquarePlus, Pin, Search, Trash2 } from "lucide-react";
import { desktopApi, type ConversationRecord } from "../../lib/tauri-client";
import { Input } from "../../components/ui";

/// Conversation list with search (Conversation Search requirement) and
/// pin (backed by `ai_conversations.pinned`, distinct from the
/// message-level bookmarks in `useBookmarks.ts`) — pinned conversations
/// always sort first, matching the web app's AI Assistant sidebar
/// ordering convention.
export function ConversationSidebar({
  activeId,
  onSelect,
  projectId,
}: {
  activeId: string | null;
  onSelect: (id: string) => void;
  projectId?: string;
}) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");

  const conversationsQuery = useQuery({ queryKey: ["conversations", projectId], queryFn: () => desktopApi.listConversations(projectId) });

  const createMutation = useMutation({
    mutationFn: () => desktopApi.createConversation(projectId),
    onSuccess: (conversation) => {
      void queryClient.invalidateQueries({ queryKey: ["conversations", projectId] });
      onSelect(conversation.id);
    },
  });

  const pinMutation = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) => desktopApi.pinConversation(id, pinned),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["conversations", projectId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => desktopApi.deleteConversation(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["conversations", projectId] }),
  });

  const filtered = useMemo(() => {
    const all = conversationsQuery.data ?? [];
    const q = query.trim().toLowerCase();
    const matching = q ? all.filter((c) => (c.title ?? "").toLowerCase().includes(q)) : all;
    return [...matching].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
  }, [conversationsQuery.data, query]);

  return (
    <div style={{ width: 260, flexShrink: 0, borderRight: "1px solid var(--color-border)", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        <button
          onClick={() => createMutation.mutate()}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 10px",
            borderRadius: "var(--radius-sm)",
            background: "var(--color-primary)",
            color: "var(--color-primary-fg)",
            border: "none",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <MessageSquarePlus size={15} /> New Chat
        </button>
        <div style={{ position: "relative" }}>
          <Search size={13} style={{ position: "absolute", left: 8, top: 9, color: "var(--color-text-muted)" }} />
          <Input placeholder="Search conversations…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ paddingLeft: 26 }} />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 6px 6px" }}>
        {filtered.map((conversation) => (
          <ConversationItem
            key={conversation.id}
            conversation={conversation}
            active={conversation.id === activeId}
            onSelect={() => onSelect(conversation.id)}
            onTogglePin={() => pinMutation.mutate({ id: conversation.id, pinned: !conversation.pinned })}
            onDelete={() => deleteMutation.mutate(conversation.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ConversationItem({
  conversation,
  active,
  onSelect,
  onTogglePin,
  onDelete,
}: {
  conversation: ConversationRecord;
  active: boolean;
  onSelect: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 10px",
        borderRadius: "var(--radius-sm)",
        cursor: "pointer",
        background: active ? "var(--color-bg-subtle)" : "transparent",
        fontSize: 12.5,
        marginBottom: 2,
      }}
    >
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{conversation.title ?? "New conversation"}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin();
        }}
        title={conversation.pinned ? "Unpin" : "Pin"}
        style={{ border: "none", background: "transparent", cursor: "pointer", color: conversation.pinned ? "var(--color-primary)" : "var(--color-text-muted)", padding: 2 }}
      >
        <Pin size={12} fill={conversation.pinned ? "currentColor" : "none"} />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete"
        style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text-muted)", padding: 2 }}
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}
