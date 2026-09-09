import { BookOpen, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/common/empty-state";
import { ListSkeleton } from "@/components/common/skeletons";
import type { KnowledgeBaseReferenceEntryDto } from "@pentesthub/shared";

export function KnowledgeBaseReferenceList({
  entries,
  isLoading,
  scores,
}: {
  entries: KnowledgeBaseReferenceEntryDto[] | undefined;
  isLoading: boolean;
  /// Present when rendering search results — relevance score per entry id.
  scores?: Map<string, number>;
}) {
  if (isLoading) return <ListSkeleton />;

  if (!entries || entries.length === 0) {
    return (
      <EmptyState icon={BookOpen} title="No reference entries found" description="Try a different search or filter." />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Framework</TableHead>
          <TableHead>Code</TableHead>
          <TableHead>Title</TableHead>
          <TableHead>Summary</TableHead>
          {scores && <TableHead>Relevance</TableHead>}
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell>
              <Badge variant="outline">{entry.framework.replace("_", " ")}</Badge>
            </TableCell>
            <TableCell className="font-mono text-xs">{entry.code}</TableCell>
            <TableCell className="max-w-xs">
              <span className="line-clamp-1 text-sm font-medium">{entry.title}</span>
            </TableCell>
            <TableCell className="max-w-md">
              <span className="line-clamp-2 text-xs text-muted-foreground">{entry.summary}</span>
            </TableCell>
            {scores && (
              <TableCell className="text-xs text-muted-foreground">
                {scores.has(entry.id) ? `${Math.round((scores.get(entry.id) ?? 0) * 100)}%` : "—"}
              </TableCell>
            )}
            <TableCell>
              {entry.url && (
                <a
                  href={entry.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  <ExternalLink className="size-3" /> Source
                </a>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
