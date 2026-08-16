"use client";

import * as React from "react";
import { toast } from "sonner";
import { TerminalSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";
import { useRunTerminalCommand, useTerminalCommandRegistry, useTerminalHistory } from "@/features/terminal/hooks/use-terminal";

/// Module 16 — Safe Terminal (task #388). Every command run from this page
/// goes through `POST /terminal/commands` -> AdHocCommandService — the
/// same Scope Engine -> Permission Check -> Approval Gate -> ToolRunner
/// chain the backend doc comment describes; this page never executes
/// anything client-side, it only calls that one endpoint. A
/// REQUIRES_APPROVAL command comes back with status PENDING_APPROVAL
/// instead of running immediately — decide it from the Security Approvals
/// screen, then re-run the same command (the backend re-verifies the
/// approval server-side rather than trusting the client).
export default function TerminalPage() {
  const { data: registry, isLoading: registryLoading } = useTerminalCommandRegistry();
  const { data: history, isLoading: historyLoading } = useTerminalHistory();
  const runCommand = useRunTerminalCommand();

  const [targetId, setTargetId] = React.useState("");
  const [tool, setTool] = React.useState("");

  async function handleRun() {
    if (!targetId || !tool) return;
    try {
      const result = await runCommand.mutateAsync({ targetId, tool, args: [] });
      if (result.status === "PENDING_APPROVAL") {
        toast.info(`${tool} requires approval — decide it from Security Approvals, then run it again.`);
      } else {
        toast.success(`${tool} finished with status ${result.status}.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to run command.");
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Terminal</h1>
        <p className="text-sm text-muted-foreground">
          Run a single recon/scanner tool against a target. Every command is scope-checked, policy-checked, and
          audit-logged — the same path Recon/Vuln jobs use, never a raw shell.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run a command</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="targetId">Target ID</Label>
              <Input id="targetId" value={targetId} onChange={(e) => setTargetId(e.target.value)} placeholder="Target UUID" />
            </div>
            <div className="w-56 space-y-1">
              <Label>Tool</Label>
              <Select value={tool} onValueChange={setTool}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a tool" />
                </SelectTrigger>
                <SelectContent>
                  {(registry ?? []).map((def) => (
                    <SelectItem key={def.name} value={def.name}>
                      {def.name} {def.requiresApproval ? "(approval required)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleRun} disabled={!targetId || !tool || runCommand.isPending}>
              Run
            </Button>
          </div>
          {registryLoading ? (
            <Skeleton className="h-6 w-full" />
          ) : (
            <p className="text-xs text-muted-foreground">
              {registry?.length ?? 0} commands on the allowlist. Anything not listed here is refused before execution.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your command history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {historyLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !history?.length ? (
            <EmptyState icon={TerminalSquare} title="No commands yet" description="Run a tool above to see its history here." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tool</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Exit code</TableHead>
                  <TableHead>Requested</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((cmd) => (
                  <TableRow key={cmd.id}>
                    <TableCell className="font-medium">{cmd.tool}</TableCell>
                    <TableCell>
                      <Badge variant={cmd.status === "SUCCEEDED" ? "default" : cmd.status === "FAILED" ? "destructive" : "outline"}>
                        {cmd.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{cmd.exitCode ?? "—"}</TableCell>
                    <TableCell>{new Date(cmd.createdAt).toLocaleString()}</TableCell>
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
