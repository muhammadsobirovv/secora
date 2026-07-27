"use client";

import * as React from "react";
import { toast } from "sonner";
import { BookOpen, Loader2, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useKnowledgeBaseReferences,
  useReindexKnowledgeBaseReferences,
  useSearchKnowledgeBaseReferences,
} from "@/features/knowledge-base-reference/hooks/use-knowledge-base-reference";
import { KnowledgeBaseReferenceList } from "@/features/knowledge-base-reference/components/knowledge-base-reference-list";
import type { KnowledgeBaseReferenceFramework } from "@pentesthub/shared";

const FRAMEWORKS: KnowledgeBaseReferenceFramework[] = ["OWASP", "CWE", "CAPEC", "MITRE_ATTACK", "NIST", "CVE"];

/// Module 11 — AI Knowledge Base (task #227) browse/search UI. The
/// catalog is system-wide and read-mostly, so this is a simple
/// filter-and-search view — reindexing into this workspace's own RAG
/// store (KnowledgeBaseReferenceService.reindexForSemanticSearch) is an
/// explicit opt-in action, never automatic, since it costs one embedding
/// call per entry.
export default function KnowledgeBasePage() {
  const [framework, setFramework] = React.useState<KnowledgeBaseReferenceFramework | "ALL">("ALL");
  const [query, setQuery] = React.useState("");

  const isSearching = query.trim().length > 0;
  const browseQuery = useKnowledgeBaseReferences(framework === "ALL" ? undefined : framework);
  const searchQuery = useSearchKnowledgeBaseReferences(
    { query, framework: framework === "ALL" ? undefined : framework, limit: 50 },
    isSearching,
  );
  const reindex = useReindexKnowledgeBaseReferences();

  async function handleReindex(): Promise<void> {
    try {
      const result = await reindex.mutateAsync();
      toast.success(`Indexed ${result.indexed} entries into this workspace's RAG store`);
    } catch {
      toast.error("Couldn't reindex the knowledge base.");
    }
  }

  const entries = isSearching
    ? searchQuery.data?.map((r) => r.entry)
    : browseQuery.data;
  const scores = isSearching
    ? new Map(searchQuery.data?.map((r): [string, number] => [r.entry.id, r.score]))
    : undefined;
  const isLoading = isSearching ? searchQuery.isLoading : browseQuery.isLoading;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <BookOpen className="size-6" /> Knowledge Base
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The OWASP/CWE/CAPEC/MITRE ATT&amp;CK/NIST/CVE reference catalog specialist agents draw on.
          </p>
        </div>
        <Button size="sm" variant="outline" disabled={reindex.isPending} onClick={() => void handleReindex()}>
          {reindex.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Reindex into RAG
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search the catalog…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-72 pl-8"
          />
        </div>
        <Select value={framework} onValueChange={(v) => setFramework(v as KnowledgeBaseReferenceFramework | "ALL")}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Framework" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All frameworks</SelectItem>
            {FRAMEWORKS.map((f) => (
              <SelectItem key={f} value={f}>
                {f.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {entries ? `${entries.length} entr${entries.length === 1 ? "y" : "ies"}` : "Entries"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <KnowledgeBaseReferenceList entries={entries} isLoading={isLoading} scores={scores} />
        </CardContent>
      </Card>
    </div>
  );
}
