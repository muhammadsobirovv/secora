"use client";

import { AlertTriangle, Bug, FileText, Radar, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useAiContextSummary, useAiSuggestedQuestions } from "../hooks/use-ai";

/// Context Indicator + Suggested Questions (AI Dashboard spec) — proof
/// the AI "automatically gathers context" rather than requiring the user
/// to paste anything in.
export function AiContextPanel({
  projectId,
  onAskQuestion,
}: {
  projectId: string;
  onAskQuestion: (prompt: string) => void;
}) {
  const { data: summary, isLoading } = useAiContextSummary(projectId);
  const { data: questions } = useAiSuggestedQuestions(projectId);

  return (
    <div className="flex w-72 shrink-0 flex-col gap-4 border-l p-4">
      <div>
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">What the AI knows</h3>
        {isLoading || !summary ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="gap-1">
              <Target className="size-3" />
              {summary.targetCount} targets
            </Badge>
            <Badge variant="secondary" className="gap-1">
              <Radar className="size-3" />
              {summary.reconFindingCount} recon
            </Badge>
            <Badge variant="secondary" className="gap-1">
              <Bug className="size-3" />
              {summary.vulnFindingCount} findings
            </Badge>
            <Badge variant="secondary" className="gap-1">
              <FileText className="size-3" />
              {summary.noteCount} notes
            </Badge>
            {summary.openCriticalOrHighFindings > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="size-3" />
                {summary.openCriticalOrHighFindings} critical/high
              </Badge>
            )}
          </div>
        )}
      </div>

      {questions && questions.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">Suggested questions</h3>
          <div className="flex flex-col gap-1.5">
            {questions.map((q) => (
              <Button
                key={q.label}
                type="button"
                variant="outline"
                size="sm"
                className="h-auto justify-start whitespace-normal py-2 text-left text-xs"
                onClick={() => onAskQuestion(q.prompt)}
              >
                {q.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
