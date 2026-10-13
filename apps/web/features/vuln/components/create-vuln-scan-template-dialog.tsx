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
import { useI18n } from "@/features/i18n/i18n-context";
import { useCreateVulnScanTemplate } from "../hooks/use-vuln";
import type { VulnScanner } from "@pentesthub/shared";

/// Unlike VulnScannerSelectList (used when creating a job against one
/// concrete target), a template isn't bound to any target type yet — it
/// gets applied to whichever target the user later starts a scan
/// against — so every scanner is selectable here with no greying-out.
const ALL_SCANNERS: VulnScanner[] = ["NUCLEI", "FFUF", "DIRSEARCH", "FEROXBUSTER", "NIKTO"];

export function CreateVulnScanTemplateDialog() {
  const { t } = useI18n();
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
      toast.success(t("vuln.template.created"));
      setOpen(false);
      setName("");
      setDescription("");
      setScanners([]);
    } catch {
      toast.error(t("vuln.template.createError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> {t("vuln.template.new")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("vuln.template.title")}</DialogTitle>
          <DialogDescription>{t("vuln.template.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div>
            <Label htmlFor="template-name">{t("vuln.template.name")}</Label>
            <Input id="template-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="template-description">{t("vuln.template.descriptionLabel")}</Label>
            <Textarea
              id="template-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1"
              rows={2}
            />
          </div>
          <div>
            <Label>{t("vuln.template.scanners")}</Label>
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
            {t("vuln.template.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
