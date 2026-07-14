/// Shared by One-Click Code/Conversation Export and per-message Download
/// (Phase 2) — a plain client-side Blob download, no backend endpoint
/// needed since everything being exported (message content, whole
/// conversations) is already present in the frontend's React Query cache.
export function downloadTextFile(filename: string, content: string, mimeType = "text/markdown"): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
