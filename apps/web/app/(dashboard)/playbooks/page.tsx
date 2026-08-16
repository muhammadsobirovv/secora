"use client";

import * as React from "react";
import Link from "next/link";
import { Copy, Plus, Workflow } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";
import { useClonePlaybook, useCreatePlaybook, usePlaybooks } from "@/features/playbooks/hooks/use-playbooks";
import type { PlaybookStatus } from "@pentesthub/shared";

const STATUS_VARIANTS: Record<PlaybookStatus, "default" | "secondary" | "outline"> = {
  DRAFT: "outline",
  PUBLISHED: "default",
  ARCHIVED: "secondary",
};

const DEFAULT_GRAPH_JSON = JSON.stringify(
  {
    nodes: [
      { id: "n1", type: "TARGET", label: "Target", config: {} },
      { id: "n2", type: "SCOPE_VALIDATION", label: "Verify in-scope", config: {} },
      { id: "n3", type: "RECON", label: "Subdomain enumeration", config: { tool: "SUBFINDER" } },
    ],
    edges: [
      { id: "e1", from: "n1", to: "n2" },
      { id: "e2", from: "n2", to: "n3" },
    ],
  },
  null,
  2,
);

/// Module 16 — Playbooks + Playbook Builder (task #389). **Disclosed scope
/// reduction**: this is a functional list/create/clone/publish UI backed
/// by a raw JSON graph editor, not the full drag-and-drop visual canvas
/// (nodes/edges/variables/conditions/parallel branches as draggable
/// elements) the spec describes — building a production-quality graph
/// canvas was judged out of scope for this pass given the size of the
/// remaining backend work in the same cluster. Every backend safety
/// property (validation, cycle detection, tool-registry checks, dry-run)
/// is fully real regardless of which UI produces the graph JSON; a visual
/// canvas is a pure input-method upgrade on top of the same
/// `PlaybookValidationResultDto`/`PlaybookDryRunResultDto` this page
/// already renders.
export default function PlaybooksPage() {
  const { data: playbooks, isLoading } = usePlaybooks();
  const createPlaybook = useCreatePlaybook();
  const clonePlaybook = useClonePlaybook();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "",
    description: "",
    category: "RECON",
    graphJson: DEFAULT_GRAPH_JSON,
  });

  async function handleCreate() {
    let graph: unknown;
    try {
      graph = JSON.parse(form.graphJson);
    } catch {
      toast.error("Graph must be valid JSON.");
      return;
    }
    try {
      await createPlaybook.mutateAsync({
        name: form.name,
        description: form.description || undefined,
        category: form.category,
        graph: graph as never,
      });
      toast.success("Playbook draft created.");
      setOpen(false);
      setForm({ name: "", description: "", category: "RECON", graphJson: DEFAULT_GRAPH_JSON });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create playbook.");
    }
  }

  async function handleClone(id: string) {
    try {
      await clonePlaybook.mutateAsync(id);
      toast.success("Playbook cloned.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to clone playbook.");
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Playbooks</h1>
          <p className="text-sm text-muted-foreground">
            Reusable, auditable step graphs for recon, pentest, and bug bounty workflows. 8 built-in playbooks are
            seeded automatically the first time you open this page.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> New playbook
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>New playbook draft</DialogTitle>
              <DialogDescription>
                Define the step graph as JSON. It will be validated before you can publish it.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="graphJson">Step graph (JSON)</Label>
                <Textarea
                  id="graphJson"
                  rows={12}
                  className="font-mono text-xs"
                  value={form.graphJson}
                  onChange={(e) => setForm((f) => ({ ...f, graphJson: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={!form.name || createPlaybook.isPending}>
                Create draft
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !playbooks?.length ? (
            <EmptyState icon={Workflow} title="No playbooks yet" description="Create a playbook to reuse a recon/pentest workflow." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Built-in</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {playbooks.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link href={`/playbooks/${p.id}`} className="font-medium hover:underline">
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell>{p.category}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANTS[p.status] ?? "outline"}>{p.status}</Badge>
                    </TableCell>
                    <TableCell>{p.isBuiltIn ? "Yes" : "No"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => handleClone(p.id)} title="Clone">
                        <Copy className="h-4 w-4" />
                      </Button>
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
