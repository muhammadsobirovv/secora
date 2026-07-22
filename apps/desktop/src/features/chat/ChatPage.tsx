import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2, MessageSquare, Wrench } from "lucide-react";
import { desktopApi } from "../../lib/tauri-client";
import { ConversationSidebar } from "./ConversationSidebar";
import { MessageBubble } from "./MessageBubble";
import { Composer } from "./Composer";
import { useChatStream } from "./useChatStream";
import { exportConversation, type ExportFormat } from "./export";
import { Button, EmptyState } from "../../components/ui";

const EXPORT_FORMATS: ExportFormat[] = ["txt", "md", "json", "zip", "pdf"];

/// Full Desktop AI Chat — conversation list (search/pin/delete), message
/// stream (Markdown/Mermaid/syntax highlighting/Canvas via
/// `MessageBubble`+`CodeBlock`+`Mermaid`), Composer (streaming send +
/// voice input + provider switch), and one-click conversation export.
export function ChatPage() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const conversationQuery = useQuery({ queryKey: ["conversation", activeId], queryFn: () => desktopApi.getConversation(activeId!), enabled: !!activeId });
  const messagesQuery = useQuery({ queryKey: ["messages", activeId], queryFn: () => desktopApi.listMessages(activeId!), enabled: !!activeId });
  const { send, streamingText, isStreaming, streamError, pendingToolCall } = useChatStream(activeId);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messagesQuery.data, streamingText]);

  const handleExport = async (format: ExportFormat) => {
    if (!conversationQuery.data || !messagesQuery.data) return;
    await exportConversation(conversationQuery.data, messagesQuery.data, format);
    setExportMenuOpen(false);
  };

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <ConversationSidebar activeId={activeId} onSelect={setActiveId} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {!activeId && (
          <EmptyState
            icon={<MessageSquare size={28} />}
            title="No conversation selected"
            description="Start a new chat or pick one from the sidebar."
          />
        )}

        {activeId && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid var(--color-border)" }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{conversationQuery.data?.title ?? "New conversation"}</div>
              <div style={{ position: "relative" }}>
                <Button size="sm" variant="outline" onClick={() => setExportMenuOpen((v) => !v)}>
                  <Download size={13} /> Export
                </Button>
                {exportMenuOpen && (
                  <div style={{ position: "absolute", right: 0, top: "100%", marginTop: 4, background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", boxShadow: "var(--shadow-md)", zIndex: 10, minWidth: 100 }}>
                    {EXPORT_FORMATS.map((format) => (
                      <div
                        key={format}
                        onClick={() => void handleExport(format)}
                        style={{ padding: "7px 14px", fontSize: 12, cursor: "pointer" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-subtle)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        .{format}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div ref={scrollRef} className="phai-scrollbar-thin" style={{ flex: 1, overflowY: "auto", padding: "8px 20px" }}>
              {messagesQuery.data?.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}

              {isStreaming && (
                <div style={{ display: "flex", gap: 10, padding: "10px 0" }}>
                  <div style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--color-bg-subtle)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Loader2 size={13} style={{ animation: "phai-spin 0.8s linear infinite", color: "var(--color-text-muted)" }} />
                  </div>
                  <div style={{ maxWidth: "78%", background: "var(--color-bg-subtle)", borderRadius: "var(--radius-lg)", padding: "10px 14px", fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                    {pendingToolCall && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-text-muted)", marginBottom: 6 }}>
                        <Wrench size={12} /> Using tool: {pendingToolCall.toolName}…
                      </div>
                    )}
                    {streamingText || "…"}
                  </div>
                </div>
              )}

              {streamError && <div style={{ fontSize: 12, color: "var(--color-danger)", padding: "8px 0" }}>Error: {streamError}</div>}
            </div>

            <Composer onSend={(content, provider) => send.mutate({ content, provider })} disabled={isStreaming} />
          </>
        )}
      </div>
    </div>
  );
}
