"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ImageIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectPicker } from "@/components/common/project-picker";
import { EvidenceForm } from "@/features/evidence/components/evidence-form";
import { useCreateEvidence } from "@/features/evidence/hooks/use-evidence";
import type { EvidenceFormValues } from "@/features/evidence/validators/evidence.schema";

function NewEvidenceContent() {
  const projectId = useSearchParams().get("projectId");

  if (!projectId) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">Add evidence</h1>
        <ProjectPicker
          icon={ImageIcon}
          description="Which project does this evidence belong to?"
          hrefFor={(id) => `/evidence/new?projectId=${id}`}
        />
      </div>
    );
  }

  return <NewEvidenceForm projectId={projectId} />;
}

function NewEvidenceForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const createEvidence = useCreateEvidence(projectId);

  async function handleSubmit(values: EvidenceFormValues) {
    try {
      const evidence = await createEvidence.mutateAsync({
        type: values.type,
        title: values.title,
        description: values.description || undefined,
        textContent: values.textContent || undefined,
      });
      toast.success("Evidence added");
      router.push(`/evidence/${evidence.id}`);
    } catch {
      toast.error("Couldn't add evidence. Please try again.");
    }
  }

  return (
    <div className="max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>Add evidence</CardTitle>
        </CardHeader>
        <CardContent>
          <EvidenceForm onSubmit={handleSubmit} submitting={createEvidence.isPending} />
        </CardContent>
      </Card>
    </div>
  );
}

export default function NewEvidencePage() {
  return (
    <Suspense>
      <NewEvidenceContent />
    </Suspense>
  );
}
