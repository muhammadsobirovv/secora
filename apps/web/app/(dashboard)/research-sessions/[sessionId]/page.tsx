"use client";

import { use } from "react";
import { toast } from "sonner";
import { FlaskConical, Pause, Play, Archive, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/common/error-state";
import { ListSkeleton } from "@/components/common/skeletons";
import {
  useArchiveResearchSession,
  useCompleteResearchSession,
  usePauseResearchSession,
  useResearchSession,
  useResearchSessionLinks,
  useResumeResearchSession,
} from "@/features/research-sessions/hooks/use-research-sessions";
import { getApiErrorMessage } from "@/lib/api/error";
import { formatDateTime } from "@/lib/format";
import type { ResearchSessionDto } from "@pentesthub/shared";

const STATUS_VARIANT: Record<ResearchSessionDto["status"], "default" | "secondary" | "success" | "outline"> = {
  ACTIVE: "default",
  PAUSED: "secondary",
  COMPLETED: "success",
  ARCHIVED: "outline",
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  RECON_JOB: "Recon job",
  VULN_SCAN_JOB: "Vuln scan job",
  BUGBOUNTY_FINDING: "Bug bounty finding",
  VULN_FINDING: "Vuln finding",
  NOTE: "Note",
  EVIDENCE: "Evidence",
  AD_HOC_COMMAND: "Terminal command",
  AI_CONVERSATION: "AI conversation",
  AI_INVESTIGATION_SESSION: "AI investigation",
  BUG_REPORT: "Bug report",
  ACTIVITY_EVENT: "Activity event",
};

/// Module 16 — task #371.
export default function ResearchSessionDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const { data: session, isLoading, isError, refetch } = useResearchSession(sessionId);
  const { data: links, isLoading: linksLoading } = useResearchSessionLinks(sessionId);

  const pause = usePauseResearchSession();
  const resume = useResumeResearchSession();
  const complete = useCompleteResearchSession();
  const archive = useArchiveResearchSession();

  async function runTransition(
    mutation: { mutateAsync: (id: string) => Promise<unknown> },
    successMessage: string,
  ) {
    try {
      await mutation.mutateAsync(sessionId);
      toast.success(successMessage);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "That action failed. Try again."));
    }
  }

  if (isLoading) return <ListSkeleton />;
  if (isError || !session) {
    return <ErrorState description="Couldn't load this research session." onRetry={() => void refetch()} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <FlaskConical className="size-5 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-semibold">{session.name}</h1>
            <p className="text-sm text-muted-foreground">
              Started {formatDateTime(session.startedAt)}
              {session.endedAt ? ` · Ended ${formatDateTime(session.endedAt)}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={STATUS_VARIANT[session.status]}>{session.status}</Badge>
          {session.status === "ACTIVE" && (
            <Button variant="outline" size="sm" onClick={() => void runTransition(pause, "Session paused.")}>
              <Pause className="size-4" /> Pause
            </Button>
          )}
          {session.status === "PAUSED" && (
            <Button variant="outline" size="sm" onClick={() => void runTransition(resume, "Session resumed.")}>
              <Play className="size-4" /> Resume
            </Button>
          )}
          {(session.status === "ACTIVE" || session.status === "PAUSED") && (
            <Button variant="outline" size="sm" onClick={() => void runTransition(complete, "Session marked complete.")}>
              <CheckCircle2 className="size-4" /> Complete
            </Button>
          )}
          {session.status !== "ARCHIVED" && (
            <Button variant="outline" size="sm" onClick={() => void runTransition(archive, "Session archived.")}>
              <Archive className="size-4" /> Archive
            </Button>
          )}
        </div>
      </div>

      {session.description && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{session.description}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Linked activity</CardTitle>
        </CardHeader>
        <CardContent>
          {linksLoading ? (
            <ListSkeleton />
          ) : links && links.length > 0 ? (
            <div className="flex flex-col divide-y divide-border">
              {links.map((link) => (
                <div key={link.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium">
                      {ENTITY_TYPE_LABELS[link.entityType] ?? link.entityType}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">{link.entityId}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{formatDateTime(link.linkedAt)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing linked yet — link Recon jobs, findings, notes, or evidence to this session
              from their own pages as you work.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
