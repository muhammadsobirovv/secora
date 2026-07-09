"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TargetForm } from "@/features/targets/components/target-form";
import { useTarget, useUpdateTarget } from "@/features/targets/hooks/use-targets";
import type { TargetFormValues } from "@/features/targets/validators/target.schema";

export default function EditTargetPage({ params }: { params: Promise<{ targetId: string }> }) {
  const { targetId } = use(params);
  const router = useRouter();
  const { data: target, isLoading } = useTarget(targetId);
  const updateTarget = useUpdateTarget(targetId);

  async function handleSubmit(values: TargetFormValues) {
    try {
      await updateTarget.mutateAsync({
        value: values.value,
        name: values.name || undefined,
        description: values.description || undefined,
        environment: values.environment,
        scopeStatus: values.scopeStatus,
      });
      toast.success("Target updated");
      router.push(`/targets/${targetId}`);
    } catch {
      toast.error("Couldn't update target. Please try again.");
    }
  }

  return (
    <div className="max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>Edit target</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading || !target ? (
            <div className="flex flex-col gap-4">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <TargetForm
              defaultValues={{
                type: target.type,
                value: target.value,
                name: target.name ?? "",
                description: target.description ?? "",
                environment: target.environment,
                scopeStatus: target.scopeStatus,
              }}
              onSubmit={handleSubmit}
              submitting={updateTarget.isPending}
              submitLabel="Save changes"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
