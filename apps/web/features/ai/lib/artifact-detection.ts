/// Artifact Mode (Phase 2) heuristic: a message is "artifact-worthy" when
/// it contains a substantial fenced code block — the kind of content
/// that's cramped inside a chat bubble and better viewed full-size in a
/// side panel (a generated PoC, payload set, or draft report from the
/// generate_poc/generate_payloads/draft_report tools, or just a long
/// code answer). Deliberately a simple line-count heuristic rather than
/// tying this to specific tool names, so it also catches long code the
/// model writes inline without calling a tool.
const ARTIFACT_MIN_LINES = 12;

const FENCED_CODE_BLOCK = /```[^\n]*\n([\s\S]*?)```/g;

export function isArtifactWorthy(content: string): boolean {
  if (!content) return false;
  for (const match of content.matchAll(FENCED_CODE_BLOCK)) {
    const body = match[1] ?? "";
    const lineCount = body.split("\n").length;
    if (lineCount >= ARTIFACT_MIN_LINES) return true;
  }
  return false;
}

/// Extracts the single largest fenced code block's body + declared
/// language, for the Artifact panel to render — falls back to the whole
/// message content when there's no fenced block (shouldn't happen given
/// isArtifactWorthy gates the "Open in Artifact" action, but keeps this
/// safe to call standalone).
export function extractPrimaryArtifact(content: string): { language: string | null; code: string } {
  let best: { language: string | null; code: string } | null = null;
  let bestLines = 0;
  const withLang = /```([^\n]*)\n([\s\S]*?)```/g;
  for (const match of content.matchAll(withLang)) {
    const language = (match[1] ?? "").trim() || null;
    const code = match[2] ?? "";
    const lines = code.split("\n").length;
    if (lines > bestLines) {
      bestLines = lines;
      best = { language, code };
    }
  }
  return best ?? { language: null, code: content };
}
