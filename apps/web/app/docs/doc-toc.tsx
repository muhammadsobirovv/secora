"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface TocEntry {
  id: string;
  text: string;
}

function slugify(text: string, index: number): string {
  const slug = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `${slug}-${index}` : `section-${index}`;
}

/// "On this page": built from the rendered article's <h2> headings (the
/// Markdown renderer adds no ids), highlighting the one being read.
export function DocToc({ containerId, label }: { containerId: string; label: string }) {
  const [entries, setEntries] = React.useState<TocEntry[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const container = document.getElementById(containerId);
    if (!container) return;

    const headings = Array.from(container.querySelectorAll<HTMLHeadingElement>("h2"));
    headings.forEach((heading, i) => {
      if (!heading.id) heading.id = slugify(heading.textContent ?? "", i);
      heading.classList.add("scroll-mt-24");
    });
    // Deferred one frame: the list is state, and setting it synchronously in
    // the effect body would cascade an extra render during hydration.
    const frame = requestAnimationFrame(() =>
      setEntries(headings.map((h) => ({ id: h.id, text: h.textContent ?? "" }))),
    );

    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (items) => {
        for (const item of items) {
          if (item.isIntersecting) visible.add(item.target.id);
          else visible.delete(item.target.id);
        }
        const first = headings.find((h) => visible.has(h.id));
        if (first) setActiveId(first.id);
      },
      { rootMargin: "-10% 0px -70% 0px" },
    );
    headings.forEach((h) => observer.observe(h));
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [containerId]);

  if (entries.length < 2) return null;

  return (
    <nav aria-label={label}>
      <p className="mb-3 font-mono text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </p>
      <ul className="flex flex-col gap-1.5 border-l border-border">
        {entries.map((entry) => (
          <li key={entry.id}>
            <a
              href={`#${entry.id}`}
              className={cn(
                "-ml-px block border-l-2 py-0.5 pl-3 text-sm transition-colors",
                activeId === entry.id
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {entry.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
