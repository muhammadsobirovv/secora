import type { AiConversationDetailDto } from "@pentesthub/shared";

/// One-Click Conversation Export (Phase 2) — renders a conversation to a
/// standalone Markdown document (title, per-message role headers,
/// timestamps) entirely client-side from data already in the React Query
/// cache; no backend endpoint needed.
export function conversationToMarkdown(conversation: AiConversationDetailDto): string {
  const lines: string[] = [`# ${conversation.title ?? "AI Security Copilot conversation"}`, ""];
  lines.push(`_Exported ${new Date().toISOString()}_`, "");

  for (const message of conversation.messages) {
    if (message.role === "SYSTEM" || message.role === "TOOL") continue;
    const heading = message.role === "USER" ? "You" : "AI";
    lines.push(`## ${heading} — ${new Date(message.createdAt).toLocaleString()}`, "");
    lines.push(message.content, "");
  }

  return lines.join("\n");
}

export function conversationExportFilename(conversation: AiConversationDetailDto): string {
  const slug = (conversation.title ?? "conversation")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/(^-|-$)/g, "");
  return `${slug || "ai-conversation"}.md`;
}
