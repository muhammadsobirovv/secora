"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { evidenceFormSchema, evidenceTypeValues, type EvidenceFormValues } from "../validators/evidence.schema";
import { EvidenceTypeBadge } from "./evidence-type-badge";

interface EvidenceFormProps {
  defaultValues?: Partial<EvidenceFormValues>;
  onSubmit: (values: EvidenceFormValues) => void | Promise<void>;
  submitting?: boolean;
  submitLabel?: string;
}

const TEXT_CONTENT_TYPES = new Set(["HTTP_REQUEST", "HTTP_RESPONSE", "LOG"]);

export function EvidenceForm({ defaultValues, onSubmit, submitting, submitLabel = "Add evidence" }: EvidenceFormProps) {
  const form = useForm<EvidenceFormValues>({
    resolver: zodResolver(evidenceFormSchema),
    defaultValues: { type: "SCREENSHOT", title: "", description: "", textContent: "", ...defaultValues },
  });
  const type = form.watch("type");

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>Type</Label>
        <Select value={type} onValueChange={(v) => form.setValue("type", v as EvidenceFormValues["type"])}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {evidenceTypeValues.map((t) => (
              <SelectItem key={t} value={t}>
                <EvidenceTypeBadge type={t} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" {...form.register("title")} autoFocus />
        {form.formState.errors.title && (
          <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea id="description" rows={2} {...form.register("description")} />
      </div>
      {TEXT_CONTENT_TYPES.has(type) && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="textContent">{type === "LOG" ? "Log output" : "Raw HTTP"}</Label>
          <Textarea
            id="textContent"
            rows={8}
            className="font-mono text-xs"
            {...form.register("textContent")}
          />
        </div>
      )}
      <Button type="submit" disabled={submitting} className="mt-2 self-start">
        {submitting && <Loader2 className="size-4 animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  );
}
