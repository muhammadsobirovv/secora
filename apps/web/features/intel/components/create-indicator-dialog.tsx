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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateIndicator } from "../hooks/use-indicators";
import type { IndicatorType } from "@pentesthub/shared";

const INDICATOR_TYPES: IndicatorType[] = [
  "IP",
  "DOMAIN",
  "URL",
  "HASH",
  "EMAIL",
  "CVE",
  "CPE",
  "ASN",
  "CERTIFICATE",
  "FILE",
  "MALWARE_FAMILY",
];

/// Manually-added indicators are always created private to the caller's
/// workspace (`IndicatorsService.createManual` — see that service's own
/// doc comment) — this form never exposes a "make public" option.
export function CreateIndicatorDialog() {
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<IndicatorType>("IP");
  const [value, setValue] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [tagsInput, setTagsInput] = React.useState("");
  const createIndicator = useCreateIndicator();

  async function handleSubmit(): Promise<void> {
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      await createIndicator.mutateAsync({
        type,
        value,
        description: description || undefined,
        tags: tags.length > 0 ? tags : undefined,
      });
      toast.success("Indicator added");
      setOpen(false);
      setValue("");
      setDescription("");
      setTagsInput("");
      setType("IP");
    } catch {
      toast.error("Couldn't add this indicator.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> Add indicator
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add indicator</DialogTitle>
          <DialogDescription>
            Manually add a private indicator to this workspace. Treated as unverified data — confidence and
            source are shown alongside it everywhere it&apos;s displayed.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div>
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as IndicatorType)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INDICATOR_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="indicator-value">Value</Label>
            <Input
              id="indicator-value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. 203.0.113.5, evil.example.com, 44d88612fea8a8f36de82e1278abb02f"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="indicator-description">Description</Label>
            <Textarea
              id="indicator-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1"
              rows={2}
            />
          </div>
          <div>
            <Label htmlFor="indicator-tags">Tags (comma-separated)</Label>
            <Input
              id="indicator-tags"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g. ransomware, c2"
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => void handleSubmit()} disabled={!value || createIndicator.isPending}>
            {createIndicator.isPending && <Loader2 className="size-4 animate-spin" />}
            Add indicator
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
