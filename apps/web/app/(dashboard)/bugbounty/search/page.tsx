"use client";

import * as React from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/empty-state";
import { useBugBountySearch } from "@/features/bugbounty/hooks/use-bugbounty";
import type { BugBountySearchResultType } from "@pentesthub/shared";

const RESULT_HREF: Record<BugBountySearchResultType, (id: string) => string> = {
  PROGRAM: (id) => `/bugbounty/programs/${id}`,
  BUGBOUNTY_FINDING: (id) => `/bugbounty/findings/${id}`,
  BUG_REPORT: (id) => `/bugbounty/reports/${id}`,
  PAYLOAD: () => `/bugbounty/payloads`,
  KNOWLEDGE_BASE_NOTE: () => `/bugbounty/knowledge-base`,
  // Module 9 added these three result types to BugBountySearchResultType
  // (packages/shared/src/bugbounty.ts) but this map was never updated —
  // TypeScript only caught the gap once this Record's exhaustiveness was
  // actually checked end-to-end. None of the three have a dedicated
  // per-item route yet: /ai's conversation id is client-side component
  // state (not a URL param — see app/(dashboard)/ai/page.tsx), and there
  // is no tag-filter or standalone task-detail page in the frontend at
  // all yet. Routing to the nearest real list page beats a broken/fake
  // deep link; revisit once those pages exist.
  AI_CHAT: () => `/ai`,
  TAG: () => `/bugbounty`,
  TASK: () => `/bugbounty`,
};

export default function BugBountySearchPage() {
  const [query, setQuery] = React.useState("");
  const { data: results, isLoading } = useBugBountySearch(query);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Search className="size-6" /> Search
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Search programs, findings, reports, payloads, and notes.</p>
      </div>

      <Input
        placeholder="Search bug bounty workspace..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-lg"
        autoFocus
      />

      {query.trim().length <= 1 ? (
        <p className="text-sm text-muted-foreground">Type at least 2 characters to search.</p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Searching...</p>
      ) : !results?.length ? (
        <EmptyState icon={Search} title="No results" />
      ) : (
        <Card>
          <CardContent className="flex flex-col divide-y divide-border p-0">
            {results.map((r) => (
              <Link
                key={`${r.type}-${r.id}`}
                href={RESULT_HREF[r.type](r.id)}
                className="flex items-center justify-between gap-3 p-3 text-sm hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.title}</p>
                  {r.snippet && <p className="truncate text-xs text-muted-foreground">{r.snippet}</p>}
                </div>
                <Badge variant="outline" className="shrink-0">
                  {r.type}
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
