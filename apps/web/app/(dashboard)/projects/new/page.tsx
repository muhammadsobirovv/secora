"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectForm } from "@/features/projects/components/project-form";
import { useCreateProject } from "@/features/projects/hooks/use-projects";
import type { ProjectFormValues } from "@/features/projects/validators/project.schema";

export default function NewProjectPage() {
  const router = useRouter();
  const createProject = useCreateProject();

  async function handleSubmit(values: ProjectFormValues) {
    try {
      const project = await createProject.mutateAsync({
        name: values.name,
        description: values.description || undefined,
        visibility: values.visibility,
      });
      toast.success("Project created");
      router.push(`/projects/${project.id}`);
    } catch {
      toast.error("Couldn't create project. Please try again.");
    }
  }

  return (
    <div className="max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>New project</CardTitle>
          <CardDescription>Projects group targets, notes, and evidence for an engagement.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProjectForm onSubmit={handleSubmit} submitting={createProject.isPending} />
        </CardContent>
      </Card>
    </div>
  );
}
