"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, Plus, Radar, Upload } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useI18n } from "@/features/i18n/i18n-context";
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
  useBugBountyPrograms,
  useCreateBugBountyProgram,
  useImportBugBountyProgram,
} from "@/features/bugbounty/hooks/use-bugbounty";
import { BugBountyProgramStatusBadge } from "@/features/bugbounty/components/bugbounty-badges";
import type { BugBountyPlatform, ProgramImportSource } from "@pentesthub/shared";

const PLATFORMS: BugBountyPlatform[] = [
  "HACKERONE",
  "BUGCROWD",
  "INTIGRITI",
  "YESWEHACK",
  "SYNACK",
  "INTERNAL",
  "PRIVATE",
  "CUSTOM",
];

const IMPORT_SOURCES: ProgramImportSource[] = ["HACKERONE", "BUGCROWD", "INTIGRITI", "MARKDOWN", "JSON"];

function CreateProgramDialog() {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [platform, setPlatform] = React.useState<BugBountyPlatform>("HACKERONE");
  const [organization, setOrganization] = React.useState("");
  const [url, setUrl] = React.useState("");
  const createProgram = useCreateBugBountyProgram();

  async function handleSubmit(): Promise<void> {
    try {
      await createProgram.mutateAsync({
        name,
        platform,
        organization: organization || undefined,
        url: url || undefined,
      });
      toast.success("Program created");
      setOpen(false);
      setName("");
      setOrganization("");
      setUrl("");
    } catch {
      toast.error("Couldn't create this program.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> New program
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New bug bounty program</DialogTitle>
          <DialogDescription>Track scope, findings, and reports for a program.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div>
            <Label htmlFor="program-name">Name</Label>
            <Input id="program-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Platform</Label>
            <Select value={platform} onValueChange={(v) => setPlatform(v as BugBountyPlatform)}>
              <SelectTrigger className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="program-org">Organization</Label>
            <Input
              id="program-org"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="program-url">Program URL</Label>
            <Input id="program-url" value={url} onChange={(e) => setUrl(e.target.value)} className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => void handleSubmit()} disabled={!name || createProgram.isPending}>
            {createProgram.isPending && <Loader2 className="size-4 animate-spin" />}
            Create program
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportProgramDialog() {
  const [open, setOpen] = React.useState(false);
  const [source, setSource] = React.useState<ProgramImportSource>("HACKERONE");
  const [raw, setRaw] = React.useState("");
  // Program-scope attestation: linked targets the program classifies
  // IN_SCOPE then count as authorized for active scans (12 months).
  const [scopeAttested, setScopeAttested] = React.useState(false);
  const importProgram = useImportBugBountyProgram();
  const { t } = useI18n();

  async function handleSubmit(): Promise<void> {
    try {
      const result = await importProgram.mutateAsync({
        source,
        raw,
        scopeAttestation: { attested: scopeAttested },
      });
      toast.success(`Imported "${result.program.name}" (${result.scopeItemsImported} scope items)`);
      if (result.warnings.length) {
        result.warnings.forEach((w) => toast.warning(w));
      }
      setOpen(false);
      setRaw("");
    } catch {
      toast.error("Import failed — check the payload format.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Upload className="size-4" /> Import
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import a program</DialogTitle>
          <DialogDescription>
            Paste a HackerOne/Bugcrowd/Intigriti API export, a Markdown scope doc, or a raw JSON payload.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div>
            <Label>Source</Label>
            <Select value={source} onValueChange={(v) => setSource(v as ProgramImportSource)}>
              <SelectTrigger className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IMPORT_SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="import-raw">Payload</Label>
            <Textarea
              id="import-raw"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              className="mt-1 font-mono text-xs"
              rows={12}
            />
          </div>
          <div className="flex items-start gap-3">
            <Checkbox
              id="import-scope-attest"
              checked={scopeAttested}
              onCheckedChange={(checked) => setScopeAttested(checked === true)}
              className="mt-0.5"
            />
            <Label htmlFor="import-scope-attest" className="text-sm leading-relaxed font-normal">
              {t("targetAuth.programAttest")}
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => void handleSubmit()} disabled={!raw || !scopeAttested || importProgram.isPending}>
            {importProgram.isPending && <Loader2 className="size-4 animate-spin" />}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function BugBountyProgramsPage() {
  const { data: programs, isLoading } = useBugBountyPrograms();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Radar className="size-6" /> Programs
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Bug bounty programs, scope, and linked targets.</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportProgramDialog />
          <CreateProgramDialog />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : !programs?.length ? (
        <EmptyState icon={Radar} title="No programs yet" description="Create or import a program to get started." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {programs.map((program) => (
            <Link key={program.id} href={`/bugbounty/programs/${program.id}`}>
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardContent className="flex flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{program.name}</p>
                    <BugBountyProgramStatusBadge status={program.status} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {program.platform} {program.organization ? `· ${program.organization}` : ""}
                  </p>
                  <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                    <span>{program.scopeItemCount} scope items</span>
                    <span>{program.targetCount} targets</span>
                    <span>{program.findingCount} findings</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
