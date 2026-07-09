"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectPicker } from "@/components/common/project-picker";
import { TargetForm } from "@/features/targets/components/target-form";
import { useCreateTarget } from "@/features/targets/hooks/use-targets";
import type { TargetFormValues } from "@/features/targets/validators/target.schema";

function NewTargetContent() {
  const projectId = useSearchParams().get("projectId");

  if (!projectId) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">Add a target</h1>
        <ProjectPicker
          icon={Target}
          description="Which project does this target belong to?"
          hrefFor={(id) => `/targets/new?projectId=${id}`}
        />
      </div>
    );
  }

  return <NewTargetForm projectId={projectId} />;
}

function NewTargetForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const createTarget = useCreateTarget(projectId);

  async function handleSubmit(values: TargetFormValues) {
    try {
      const target = await createTarget.mutateAsync({
        type: values.type,
        value: values.value,
        name: values.name || undefined,
        description: values.description || undefined,
        environment: values.environment,
        scopeStatus: values.scopeStatus,
      });
      toast.success("Target added");
      router.push(`/targets/${target.id}`);
    } catch {
      toast.error("Couldn't add target. Please try again.");
    }
  }

  return (
    <div className="max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>Add a target</CardTitle>
        </CardHeader>
        <CardContent>
          <TargetForm onSubmit={handleSubmit} submitting={createTarget.isPending} />
        </CardContent>
      </Card>
    </div>
  );
}

export default function NewTargetPage() {
  return (
    <Suspense>
      <NewTargetContent />
    </Suspense>
  );
}
