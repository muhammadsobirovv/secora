"use client";

import * as React from "react";
import { usePrefersReducedMotion } from "@/lib/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

const GLYPHS = "01ABCDEF#$%&/<>[]{}";

/// Faint falling-glyph backdrop drawn on a canvas that fills its (positioned)
/// parent. Purely decorative: aria-hidden, no pointer events, and not drawn
/// at all when the visitor prefers reduced motion.
export function CodeRain({
  color,
  className,
  fontSize = 14,
  frameMs = 55,
}: {
  color: string;
  className?: string;
  fontSize?: number;
  frameMs?: number;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const ref = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas || reducedMotion) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let drops: number[] = [];

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = canvas.width = Math.max(1, Math.floor(rect.width));
      height = canvas.height = Math.max(1, Math.floor(rect.height));
      drops = Array.from({ length: Math.ceil(width / fontSize) }, () => Math.random() * -50);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let frame = 0;
    let last = 0;
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (now - last < frameMs) return;
      last = now;
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = color;
      ctx.font = `${fontSize}px monospace`;
      for (let i = 0; i < drops.length; i += 1) {
        const glyph = GLYPHS[Math.floor(Math.random() * GLYPHS.length)] ?? "0";
        ctx.fillText(glyph, i * fontSize, (drops[i] ?? 0) * fontSize);
        if ((drops[i] ?? 0) * fontSize > height && Math.random() > 0.975) drops[i] = 0;
        drops[i] = (drops[i] ?? 0) + 1;
      }
    };
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [color, fontSize, frameMs, reducedMotion]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 size-full", className)}
    />
  );
}
