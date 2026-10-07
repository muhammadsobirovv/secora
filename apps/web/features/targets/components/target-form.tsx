"use client";

import type * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  targetEnvironmentValues,
  targetFormSchema,
  targetScopeStatusValues,
  targetTypeValues,
  type TargetFormValues,
} from "../validators/target.schema";
import { TargetTypeBadge } from "./target-type-badge";

const VALUE_PLACEHOLDER: Record<string, string> = {
  DOMAIN: "example.com",
  SUBDOMAIN: "api.example.com",
  URL: "https://example.com/app",
  IP_ADDRESS: "192.0.2.10",
  CIDR: "192.0.2.0/24",
  API: "https://api.example.com/v1",
  MOBILE_APP: "com.example.app",
  INTERNAL_ASSET: "internal-hostname",
};

interface TargetFormProps {
  defaultValues?: Partial<TargetFormValues>;
  onSubmit: (values: TargetFormValues) => void | Promise<void>;
  submitting?: boolean;
  submitLabel?: string;
  /// Rendered just above the submit button (e.g. authorization fields).
  extra?: React.ReactNode;
  submitDisabled?: boolean;
}

export function TargetForm({
  defaultValues,
  onSubmit,
  submitting,
  submitLabel = "Add target",
  extra,
  submitDisabled,
}: TargetFormProps) {
  const form = useForm<TargetFormValues>({
    resolver: zodResolver(targetFormSchema),
    defaultValues: {
      type: "DOMAIN",
      value: "",
      name: "",
      description: "",
      environment: "UNKNOWN",
      scopeStatus: "PENDING_REVIEW",
      ...defaultValues,
    },
  });
  const type = form.watch("type");

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>Type</Label>
        <Select value={type} onValueChange={(v) => form.setValue("type", v as TargetFormValues["type"])}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {targetTypeValues.map((t) => (
              <SelectItem key={t} value={t}>
                <TargetTypeBadge type={t} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="value">Value</Label>
        <Input id="value" placeholder={VALUE_PLACEHOLDER[type]} {...form.register("value")} autoFocus />
        {form.formState.errors.value && (
          <p className="text-xs text-destructive">{form.formState.errors.value.message}</p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name (optional)</Label>
        <Input id="name" {...form.register("name")} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label>Environment</Label>
          <Select
            value={form.watch("environment")}
            onValueChange={(v) => form.setValue("environment", v as TargetFormValues["environment"])}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {targetEnvironmentValues.map((e) => (
                <SelectItem key={e} value={e}>
                  {e.charAt(0) + e.slice(1).toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Scope</Label>
          <Select
            value={form.watch("scopeStatus")}
            onValueChange={(v) => form.setValue("scopeStatus", v as TargetFormValues["scopeStatus"])}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {targetScopeStatusValues.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.replace("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea id="description" rows={3} {...form.register("description")} />
      </div>
      {extra}
      <Button type="submit" disabled={submitting || submitDisabled} className="mt-2 self-start">
        {submitting && <Loader2 className="size-4 animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  );
}
