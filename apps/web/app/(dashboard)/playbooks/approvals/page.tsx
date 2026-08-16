"use client";

import { toast } from "sonner";
import { ShieldQuestion } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";
import { useDecidePlaybookApproval, usePlaybookApprovals } from "@/features/playbooks/hooks/use-playbooks";

/// Module 16 — Playbooks (task #389). Approving/rejecting here calls
/// `DecidePlaybookApprovalCommand`, which re-verifies through
/// `SecurityApprovalService.decide` (never trusts a client-supplied
/// boolean alone) and then resumes or halts the underlying execution —
/// see PlaybookExecutionService.resumeAfterApproval. A rejection here
/// marks every step reachable from the gated node SKIPPED.
export default function PlaybookApprovalsPage() {
  const { data: approvals, isLoading } = usePlaybookApprovals();
  const decide = useDecidePlaybookApproval();

  async function handleDecide(id: string, approve: boolean) {
    try {
      await decide.mutateAsync({ id, data: { approve } });
      toast.success(approve ? "Approved — execution will resume." : "Rejected — dependent steps will be skipped.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to record decision.");
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Playbook approvals</h1>
        <p className="text-sm text-muted-foreground">
          Approval-gated playbook steps pause here until a human decides. Rejecting stops every step downstream of
          the gate.
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !approvals?.length ? (
            <EmptyState icon={ShieldQuestion} title="No pending approvals" description="Approval-gated playbook steps will show up here." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Execution</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead className="w-40" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {approvals.map((approval) => (
                  <TableRow key={approval.id}>
                    <TableCell className="font-mono text-xs">{approval.executionId}</TableCell>
                    <TableCell>
                      <Badge variant={approval.status === "WAITING_APPROVAL" ? "outline" : approval.status === "APPROVED" ? "default" : "destructive"}>
                        {approval.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(approval.createdAt).toLocaleString()}</TableCell>
                    <TableCell>
                      {approval.status === "WAITING_APPROVAL" && (
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleDecide(approval.id, true)} disabled={decide.isPending}>
                            Approve
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => handleDecide(approval.id, false)} disabled={decide.isPending}>
                            Reject
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
