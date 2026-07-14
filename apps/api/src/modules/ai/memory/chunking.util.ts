/// Simple fixed-size sliding-window chunker (Document Chunking). Splits on
/// paragraph/sentence boundaries where possible so chunks stay
/// semantically coherent, falling back to a hard cut only when a single
/// paragraph exceeds chunkSize on its own. This is intentionally simple
/// (no token-aware splitting, no recursive-splitter library) — good
/// enough for the workspace-note/finding-description-scale text this
/// module indexes; revisit if Phase 2 needs to chunk much larger
/// documents (e.g. full scan reports).
export function chunkText(
  text: string,
  chunkSize: number,
  overlap: number,
): string[] {
  const normalized = text.trim();
  if (normalized.length === 0) return [];
  if (normalized.length <= chunkSize) return [normalized];

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= chunkSize) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    if (paragraph.length <= chunkSize) {
      current = paragraph;
    } else {
      // A single paragraph is longer than chunkSize — hard-split it with
      // overlap so no chunk exceeds the limit.
      let start = 0;
      while (start < paragraph.length) {
        const end = Math.min(start + chunkSize, paragraph.length);
        chunks.push(paragraph.slice(start, end));
        if (end >= paragraph.length) break;
        start = end - overlap;
      }
      current = '';
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
