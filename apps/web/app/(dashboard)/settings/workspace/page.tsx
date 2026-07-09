"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useUpdateWorkspace,
  useUploadWorkspaceAvatar,
  useWorkspace,
} from "@/features/workspace/hooks/use-workspace";
import { WorkspaceAvatar } from "@/features/workspace/components/workspace-avatar";

const schema = z.object({
  name: z.string().min(1, "Name is required.").max(100),
  description: z.string().max(500).optional().or(z.literal("")),
});
type FormValues = z.infer<typeof schema>;

export default function WorkspaceSettingsPage() {
  const { data: workspace, isLoading } = useWorkspace();
  const updateWorkspace = useUpdateWorkspace();
  const uploadAvatar = useUploadWorkspaceAvatar();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: workspace ? { name: workspace.name, description: workspace.description ?? "" } : undefined,
  });

  async function onSubmit(values: FormValues) {
    try {
      await updateWorkspace.mutateAsync({
        name: values.name,
        description: values.description || undefined,
      });
      toast.success("Workspace updated");
    } catch {
      toast.error("Couldn't update workspace.");
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      await uploadAvatar.mutateAsync(file);
      toast.success("Avatar updated");
    } catch {
      toast.error("Couldn't upload avatar.");
    }
  }

  if (isLoading || !workspace) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <Skeleton className="h-16 w-16 rounded-lg" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Workspace settings</CardTitle>
        <CardDescription>These details are visible to everyone in your workspace.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <WorkspaceAvatar workspace={workspace} className="size-16" />
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadAvatar.isPending}
            >
              {uploadAvatar.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Upload className="size-3.5" />
              )}
              Change avatar
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => void handleAvatarChange(e)}
            />
          </div>
        </div>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex max-w-sm flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...form.register("name")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" rows={3} {...form.register("description")} />
          </div>
          <Button type="submit" disabled={updateWorkspace.isPending} className="self-start">
            {updateWorkspace.isPending && <Loader2 className="size-4 animate-spin" />}
            Save changes
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
