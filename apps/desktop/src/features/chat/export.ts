import JSZip from "jszip";
import type { ConversationRecord, MessageRecord } from "../../lib/tauri-client";

/// One-click conversation export — client-side, no Rust round-trip needed
/// since the source data (messages) is already in memory/React Query
/// cache. Supports the same five formats as the code-block export
/// (`CodeBlock.tsx`): .txt/.md/.json directly, .zip bundles all three,
/// .pdf uses the browser's native print-to-PDF via a hidden print
/// stylesheet rather than pulling in a second PDF library just for chat
/// export (the Report Generator's `printpdf` path is reserved for
/// pentest reports, which need precise page layout; a chat transcript
/// doesn't).
export type ExportFormat = "txt" | "md" | "json" | "zip" | "pdf";

function toMarkdown(conversation: ConversationRecord, messages: MessageRecord[]): string {
  const lines = [`# ${conversation.title ?? "Untitled conversation"}`, "", `_Exported ${new Date().toISOString()}_`, ""];
  for (const m of messages) {
    lines.push(`### ${m.role}`, "", m.content, "");
  }
  return lines.join("\n");
}

function toPlainText(conversation: ConversationRecord, messages: MessageRecord[]): string {
  const lines = [conversation.title ?? "Untitled conversation", "=".repeat(40), ""];
  for (const m of messages) {
    lines.push(`[${m.role}]`, m.content, "");
  }
  return lines.join("\n");
}

function toJson(conversation: ConversationRecord, messages: MessageRecord[]): string {
  return JSON.stringify({ conversation, messages }, null, 2);
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "conversation"
  );
}

export async function exportConversation(conversation: ConversationRecord, messages: MessageRecord[], format: ExportFormat) {
  const slug = slugify(conversation.title ?? "conversation");

  if (format === "txt") {
    download(new Blob([toPlainText(conversation, messages)], { type: "text/plain" }), `${slug}.txt`);
    return;
  }
  if (format === "md") {
    download(new Blob([toMarkdown(conversation, messages)], { type: "text/markdown" }), `${slug}.md`);
    return;
  }
  if (format === "json") {
    download(new Blob([toJson(conversation, messages)], { type: "application/json" }), `${slug}.json`);
    return;
  }
  if (format === "zip") {
    const zip = new JSZip();
    zip.file(`${slug}.txt`, toPlainText(conversation, messages));
    zip.file(`${slug}.md`, toMarkdown(conversation, messages));
    zip.file(`${slug}.json`, toJson(conversation, messages));
    const blob = await zip.generateAsync({ type: "blob" });
    download(blob, `${slug}.zip`);
    return;
  }
  if (format === "pdf") {
    // Print-to-PDF: open a print-formatted window with the transcript and
    // invoke the OS print dialog (Tauri's webview supports `window.print()`
    // same as any Chromium/WebKit webview); the user picks "Save as PDF."
    const printWindow = window.open("", "_blank", "width=800,height=600");
    if (!printWindow) return;
    const escaped = toPlainText(conversation, messages).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    printWindow.document.write(`<pre style="font-family: ui-monospace, monospace; white-space: pre-wrap; padding: 24px;">${escaped}</pre>`);
    printWindow.document.title = slug;
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }
}
