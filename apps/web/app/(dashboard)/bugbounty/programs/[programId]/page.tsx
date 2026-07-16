"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Plus, Radar, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";
import {
  useBugBountyProgram,
  useAddScopeItem,
  useRemoveScopeItem,
  useClassifyScopeValue,
  useDeleteBugBountyProgram,
  useLinkProgramTarget,
  useUnlinkProgramTarget,
} from "@/features/bugbounty/hooks/use-bugbounty";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { useTargets } from "@/features/targets/hooks/use-targets";
import {
  BugBountyProgramStatusBadge,
  ScopeClassificationBadge,
} from "@/features/bugbounty/components/bugbounty-badges";
import type { ScopeClassification, ScopeItemType } from "@pentesthub/shared";

const SCOPE_TYPES: ScopeItemType[] = [
  "DOMAIN",
  "WILDCARD",
  "URL",
  "MOBILE_APP",
  "API",
  "CIDR",
  "IP_RANGE",
  "ASN",
  "CLOUD_ASSET",
];
const CLASSIFICATIONS: ScopeClassification[] = ["IN_SCOPE", "OUT_OF_SCOPE", "UNKNOWN"];

function AddScopeItemDialog({ programId }: { programId: string }) {
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<ScopeItemType>("DOMAIN");
  const [pattern, setPattern] = React.useState("");
  const [classification, setClassification] = React.useState<ScopeClassification>("IN_SCOPE");
  const addScopeItem = useAddScopeItem(programId);

  async function handleSubmit(): Promise<void> {
    try {
      await addScopeItem.mutateAsync({ type, pattern, classification });
      toast.success("Scope item added");
      setOpen(false);
      setPattern("");
    } catch {
      toast.error("Couldn't add scope item.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="size-4" /> Add scope item
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add scope item</DialogTitle>
          <DialogDescription>Domains, wildcards, URLs, IP ranges, ASNs, etc.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div>
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as ScopeItemType)}>
              <SelectTrigger className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCOPE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="scope-pattern">Pattern</Label>
            <Input
              id="scope-pattern"
              placeholder="*.example.com, 10.0.0.0/24, ..."
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Classification</Label>
            <Select value={classification} onValueChange={(v) => setClassification(v as ScopeClassification)}>
              <SelectTrigger className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLASSIFICATIONS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => void handleSubmit()} disabled={!pattern || addScopeItem.isPending}>
            {addScopeItem.isPending && <Loader2 className="size-4 animate-spin" />}
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClassifyDialog({ programId }: { programId: string }) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");
  const classify = useClassifyScopeValue(programId);

  async function handleSubmit(): Promise<void> {
    try {
      await classify.mutateAsync({ value });
    } catch {
      toast.error("Classification failed.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Wand2 className="size-4" /> Classify value
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Classify a value against scope</DialogTitle>
          <DialogDescription>Test whether a domain/URL/IP falls in or out of scope.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input
            placeholder="app.example.com or 10.0.0.5"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <Button onClick={() => void handleSubmit()} disabled={!value || classify.isPending}>
            {classify.isPending && <Loader2 className="size-4 animate-spin" />}
            Classify
          </Button>
          {classify.data && (
            <div className="rounded-md border border-border p-3 text-sm">
              <ScopeClassificationBadge classification={classify.data.classification} />
              {classify.data.matchedPattern && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Matched pattern: <span className="font-mono">{classify.data.matchedPattern}</span>
                </p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LinkTargetDialog({ programId, projectId }: { programId: string; projectId: string | null }) {
  const [open, setOpen] = React.useState(false);
  const [selectedProjectId, setSelectedProjectId] = React.useState(projectId ?? "");
  const { data: projects } = useProjects();
  const { data: targets } = useTargets(selectedProjectId, {});
  const linkTarget = useLinkProgramTarget(programId);

  async function handleLink(targetId: string): Promise<void> {
    try {
      await linkTarget.mutateAsync({ targetId });
      toast.success("Target linked");
    } catch {
      toast.error("Couldn't link this target.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="size-4" /> Link target
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Link a target</DialogTitle>
          <DialogDescription>Pick a project, then a target to link to this program.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div>
            <Label>Project</Label>
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="mt-1 w-full">
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {projects?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedProjectId && (
            <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {targets?.length ? (
                targets.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-sm">
                    <span className="truncate">{t.value}</span>
                    <Button size="sm" variant="ghost" onClick={() => void handleLink(t.id)} disabled={linkTarget.isPending}>
                      Link
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No targets in this project yet.</p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function BugBountyProgramDetailPage() {
  const params = useParams<{ programId: string }>();
  const router = useRouter();
  const programId = params.programId;
  const { data: program, isLoading } = useBugBountyProgram(programId);
  const removeScopeItem = useRemoveScopeItem(programId);
  const unlinkTarget = useUnlinkProgramTarget(programId);
  const deleteProgram = useDeleteBugBountyProgram();

  async function handleDelete(): Promise<void> {
    if (!confirm("Delete this program? This cannot be undone.")) return;
    try {
      await deleteProgram.mutateAsync(programId);
      toast.success("Program deleted");
      router.push("/bugbounty/programs");
    } catch {
      toast.error("Couldn't delete this program.");
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!program) {
    return <EmptyState icon={Radar} title="Program not found" />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/bugbounty/programs" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to programs
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{program.name}</h1>
            <BugBountyProgramStatusBadge status={program.status} />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link href={`/bugbounty/findings?programId=${program.id}`}>Findings</Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href={`/bugbounty/reports?programId=${program.id}`}>Reports</Link>
            </Button>
            <Button size="sm" variant="destructive" onClick={() => void handleDelete()}>
              <Trash2 className="size-4" /> Delete
            </Button>
          </div>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {program.platform} {program.organization ? `· ${program.organization}` : ""} {program.url ? `· ${program.url}` : ""}
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">Scope</CardTitle>
          <div className="flex gap-2">
            <ClassifyDialog programId={programId} />
            <AddScopeItemDialog programId={programId} />
          </div>
        </CardHeader>
        <CardContent>
          {!program.scopeItems.length ? (
            <p className="text-sm text-muted-foreground">No scope items yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {program.scopeItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{item.pattern}</span>
                    <span className="text-xs text-muted-foreground">({item.type})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ScopeClassificationBadge classification={item.classification} />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void removeScopeItem.mutateAsync(item.id).then(() => toast.success("Removed"))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">Linked targets ({program.targetIds.length})</CardTitle>
          <LinkTargetDialog programId={programId} projectId={program.projectId} />
        </CardHeader>
        <CardContent>
          {!program.targetIds.length ? (
            <p className="text-sm text-muted-foreground">No targets linked yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {program.targetIds.map((targetId) => (
                <div key={targetId} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="font-mono text-xs">{targetId}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void unlinkTarget.mutateAsync(targetId).then(() => toast.success("Unlinked"))
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
