"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { projectFormSchema, type ProjectFormValues } from "../validators/project.schema";
import type { ProjectDto } from "@pentesthub/shared";

interface ProjectFormProps {
  defaultValues?: Partial<ProjectFormValues>;
  onSubmit: (values: ProjectFormValues) => void | Promise<void>;
  submitting?: boolean;
  submitLabel?: string;
  showStatus?: boolean;
}

const STATUS_LABEL: Record<NonNullable<ProjectDto["status"]>, string> = {
  ACTIVE: "Active",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

export function ProjectForm({
  defaultValues,
  onSubmit,
  submitting,
  submitLabel = "Create project",
  showStatus = false,
}: ProjectFormProps) {
  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      name: "",
      description: "",
      status: "ACTIVE",
      visibility: "WORKSPACE",
      ...defaultValues,
    },
  });

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" {...form.register("name")} autoFocus />
        {form.formState.errors.name && (
          <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" rows={4} {...form.register("description")} />
      </div>
      {showStatus && (
        <div className="flex flex-col gap-2">
          {/* Module 15 — task #349 (accessibility audit): a bare <Label>
              with no htmlFor/id pairing isn't programmatically associated
              with the Select trigger below it — screen readers announce
              the trigger's role but not "Status". aria-labelledby closes
              that gap (native `for`/`id` doesn't apply here since the
              trigger renders as a button, not a labelable form element). */}
          <Label id="status-label">Status</Label>
          <Select
            value={form.watch("status")}
            onValueChange={(v) => form.setValue("status", v as ProjectFormValues["status"])}
          >
            <SelectTrigger className="w-full" aria-labelledby="status-label">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <Button type="submit" disabled={submitting} className="mt-2 self-start">
        {submitting && <Loader2 className="size-4 animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  );
}
