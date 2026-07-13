"use client";

import * as React from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useCreateVulnScanTemplate } from "../hooks/use-vuln";
import type { VulnScanner } from "@pentesthub/shared";

/// Unlike VulnScannerSelectList (used when creating a job against one
/// concrete target), a template isn't bound to any target type yet — it
/// gets applied to whichever target the user later starts a scan
/// against — so every scanner is selectable here with no greying-out.
const ALL_SCANNERS: VulnScanner[] = ["NUCLEI", "FFUF", "DIRSEARCH", "FEROXBUSTER", "NIKTO"];

export function CreateVulnScanTemplateDialog() {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [scanners, setScanners] = React.useState<VulnScanner[]>([]);
  const createTemplate = useCreateVulnScanTemplate();

  function toggle(scanner: VulnScanner, checked: boolean): void {
    setScanners((prev) => (checked ? [...prev, scanner] : prev.filter((s) => s !== scanner)));
  }

  async function handleSubmit(): Promise<void> {
    try {
      await createTemplate.mutateAsync({
        name,
        description: description || undefined,
        scanners,
      });
      toast.success("Template created");
      setOpen(false);
      setName("");
      setDescription("");
      setScanners([]);
    } catch {
      toast.error("Couldn't create this template.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> New template
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New scan template</DialogTitle>
          <DialogDescription>
            Save a reusable scanner selection you can apply to any target&apos;s scans.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div>
            <Label htmlFor="template-name">Name</Label>
            <Input id="template-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="template-description">Description</Label>
            <Textarea
              id="template-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1"
              rows={2}
            />
          </div>
          <div>
            <Label>Scanners</Label>
            <div className="mt-1 flex flex-col gap-1.5">
              {ALL_SCANNERS.map((scanner) => (
                <label key={scanner} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={scanners.includes(scanner)}
                    onCheckedChange={(c) => toggle(scanner, c === true)}
                  />
                  {scanner}
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={() => void handleSubmit()}
            disabled={!name || scanners.length === 0 || createTemplate.isPending}
          >
            {createTemplate.isPending && <Loader2 className="size-4 animate-spin" />}
            Create template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
