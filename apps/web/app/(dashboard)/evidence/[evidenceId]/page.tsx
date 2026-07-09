"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ErrorState } from "@/components/common/error-state";
import { useDeleteEvidence, useEvidenceItem } from "@/features/evidence/hooks/use-evidence";
import { EvidenceTypeBadge } from "@/features/evidence/components/evidence-type-badge";
import { AttachmentsPanel } from "@/features/attachments/components/attachments-panel";

export default function EvidenceDetailPage({ params }: { params: Promise<{ evidenceId: string }> }) {
  const { evidenceId } = use(params);
  const router = useRouter();
  const { data: evidence, isLoading, isError, refetch } = useEvidenceItem(evidenceId);
  const deleteEvidence = useDeleteEvidence();
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleDelete() {
    if (!evidence) return;
    try {
      await deleteEvidence.mutateAsync(evidenceId);
      toast.success("Evidence deleted");
      router.push(`/projects/${evidence.projectId}?tab=evidence`);
    } catch {
      toast.error("Something went wrong.");
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError || !evidence) {
    return <ErrorState description="Couldn't load this evidence." onRetry={() => void refetch()} />;
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <EvidenceTypeBadge type={evidence.type} />
            <h1 className="text-xl font-semibold">{evidence.title}</h1>
          </div>
          {evidence.description && (
            <p className="mt-1 text-sm text-muted-foreground">{evidence.description}</p>
          )}
          <Link
            href={`/projects/${evidence.projectId}?tab=evidence`}
            className="mt-2 inline-block text-xs text-muted-foreground hover:text-foreground"
          >
            ← Back to project
          </Link>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(true)} aria-label="Delete evidence">
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </div>

      {evidence.textContent && (
        <Card>
          <CardContent className="pt-6">
            <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
              {evidence.textContent}
            </pre>
          </CardContent>
        </Card>
      )}

      {evidence.checksum && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 text-success" />
          SHA-256: <span className="font-mono">{evidence.checksum}</span>
        </div>
      )}

      <AttachmentsPanel attachableType="EVIDENCE" attachableId={evidenceId} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this evidence?</AlertDialogTitle>
            <AlertDialogDescription>This can&apos;t be undone from the dashboard.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleDelete()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
