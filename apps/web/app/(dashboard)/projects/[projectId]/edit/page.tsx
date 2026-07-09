"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectForm } from "@/features/projects/components/project-form";
import { useProject, useUpdateProject } from "@/features/projects/hooks/use-projects";
import type { ProjectFormValues } from "@/features/projects/validators/project.schema";

export default function EditProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const router = useRouter();
  const { data: project, isLoading } = useProject(projectId);
  const updateProject = useUpdateProject(projectId);

  async function handleSubmit(values: ProjectFormValues) {
    try {
      await updateProject.mutateAsync({
        name: values.name,
        description: values.description || undefined,
        status: values.status,
        visibility: values.visibility,
      });
      toast.success("Project updated");
      router.push(`/projects/${projectId}`);
    } catch {
      toast.error("Couldn't update project. Please try again.");
    }
  }

  return (
    <div className="max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>Edit project</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading || !project ? (
            <div className="flex flex-col gap-4">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <ProjectForm
              defaultValues={{
                name: project.name,
                description: project.description ?? "",
                status: project.status,
                visibility: project.visibility,
              }}
              onSubmit={handleSubmit}
              submitting={updateProject.isPending}
              submitLabel="Save changes"
              showStatus
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
