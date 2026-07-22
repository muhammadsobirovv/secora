import { useEffect, useId, useState } from "react";
import { Download } from "lucide-react";

// Same approach as the Desktop Agent's `apps/desktop/src/features/chat/
// Mermaid.tsx` — lazy-loaded so most AI responses (which don't contain a
// diagram) never pay `mermaid`'s bundle-size cost.
export function Mermaid({ chart }: { chart: string }) {
  const id = useId().replace(/:/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, theme: "default" });
        const { svg: rendered } = await mermaid.render(`mermaid-${id}`, chart);
        if (!cancelled) setSvg(rendered);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  const downloadSvg = () => {
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "diagram.svg";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (error) return <pre style={{ fontSize: 11, color: "var(--color-danger)", padding: 10 }}>Mermaid render error: {error}</pre>;

  return (
    <div style={{ position: "relative", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: 12, margin: "6px 0", background: "var(--color-bg-elevated)", overflowX: "auto" }}>
      {svg ? (
        <>
          <button
            onClick={downloadSvg}
            title="Download SVG"
            style={{ position: "absolute", top: 6, right: 6, border: "1px solid var(--color-border)", background: "var(--color-bg)", borderRadius: "var(--radius-sm)", padding: 3, cursor: "pointer", color: "var(--color-text-muted)" }}
          >
            <Download size={12} />
          </button>
          <div dangerouslySetInnerHTML={{ __html: svg }} />
        </>
      ) : (
        <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Rendering diagram…</div>
      )}
    </div>
  );
}
