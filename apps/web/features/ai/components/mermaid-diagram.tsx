"use client";

import * as React from "react";
import { Maximize, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

let mermaidInitialized = false;

/// Interactive Canvas (Phase 2): renders a fenced ```mermaid block as a
/// live, pannable/zoomable SVG diagram rather than plain text — the AI
/// can produce attack-chain, network topology, or exploit-flow diagrams
/// this way (see the coding/finding-analysis prompt modules, which are
/// free to mention mermaid syntax as an available response format).
/// `mermaid` is dynamically imported (never during SSR) since it touches
/// `document` on load.
export function MermaidDiagram({ code }: { code: string }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const dragState = React.useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const [svg, setSvg] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [scale, setScale] = React.useState(1);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });

  React.useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        const { default: mermaid } = await import("mermaid");
        if (!mermaidInitialized) {
          mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "strict" });
          mermaidInitialized = true;
        }
        const id = `mermaid-${Math.random().toString(36).slice(2)}`;
        const { svg: rendered } = await mermaid.render(id, code);
        if (!cancelled) {
          setSvg(rendered);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to render diagram");
      }
    }
    void render();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const zoomIn = () => setScale((s) => Math.min(s * 1.25, 4));
  const zoomOut = () => setScale((s) => Math.max(s / 1.25, 0.25));
  const reset = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => Math.min(Math.max(s * (e.deltaY < 0 ? 1.1 : 0.9), 0.25), 4));
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    dragState.current = { x: e.clientX, y: e.clientY, originX: offset.x, originY: offset.y };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.x;
    const dy = e.clientY - dragState.current.y;
    setOffset({ x: dragState.current.originX + dx, y: dragState.current.originY + dy });
  };
  const handlePointerUp = () => {
    dragState.current = null;
  };

  if (error) {
    return <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs text-destructive">{error}</pre>;
  }

  return (
    <div className="group relative overflow-hidden rounded-lg border bg-muted/30">
      <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <Button type="button" size="icon" variant="ghost" className="size-7" onClick={zoomOut} aria-label="Zoom out">
          <Minus className="size-3.5" />
        </Button>
        <Button type="button" size="icon" variant="ghost" className="size-7" onClick={zoomIn} aria-label="Zoom in">
          <Plus className="size-3.5" />
        </Button>
        <Button type="button" size="icon" variant="ghost" className="size-7" onClick={reset} aria-label="Reset view">
          <Maximize className="size-3.5" />
        </Button>
      </div>
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className={cn("flex min-h-[160px] items-center justify-center overflow-hidden p-4", "cursor-grab active:cursor-grabbing")}
      >
        {svg ? (
          <div
            style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
            className="transition-transform duration-75 [&_svg]:h-auto [&_svg]:max-w-none"
            // mermaid.render() output — securityLevel: "strict" sanitizes it,
            // and it's never raw, unsanitized model text.
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <span className="text-xs text-muted-foreground">Rendering diagram…</span>
        )}
      </div>
    </div>
  );
}
