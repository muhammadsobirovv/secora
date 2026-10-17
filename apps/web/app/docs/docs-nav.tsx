"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface DocsNavItem {
  slug: string;
  title: string;
}

/// Doc list: a vertical sidebar on desktop, a wrapping row of pills on
/// small screens. The page being read is highlighted.
export function DocsNav({
  items,
  label,
  orientation,
}: {
  items: DocsNavItem[];
  label: string;
  orientation: "vertical" | "horizontal";
}) {
  const pathname = usePathname();

  return (
    <nav aria-label={label}>
      <ul className={cn(orientation === "vertical" ? "flex flex-col gap-1" : "flex flex-wrap gap-2")}>
        {items.map((item) => {
          const href = `/docs/${item.slug}`;
          const current = pathname === href;
          return (
            <li key={item.slug}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "block text-sm transition-colors",
                  orientation === "vertical"
                    ? "rounded-md border-l-2 px-3 py-1.5"
                    : "rounded-full border px-3 py-1",
                  current
                    ? "border-primary bg-primary/10 font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                  orientation === "horizontal" && !current && "border-border",
                )}
              >
                {item.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
