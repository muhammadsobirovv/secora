"use client";

import { Suspense } from "react";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { FileText, Loader2 } from "lucide-react";
import { ProjectPicker } from "@/components/common/project-picker";
import { useCreateNote } from "@/features/notes/hooks/use-notes";

function NewNoteContent() {
  const projectId = useSearchParams().get("projectId");

  if (!projectId) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">New note</h1>
        <ProjectPicker
          icon={FileText}
          description="Which project does this note belong to?"
          hrefFor={(id) => `/notes/new?projectId=${id}`}
        />
      </div>
    );
  }

  return <CreatingNote projectId={projectId} />;
}

function CreatingNote({ projectId }: { projectId: string }) {
  const router = useRouter();
  const createNote = useCreateNote(projectId);
  const attempted = React.useRef(false);

  React.useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    createNote
      .mutateAsync({ content: "" })
      .then((note) => router.replace(`/notes/${note.id}`))
      .catch(() => toast.error("Couldn't create note. Please try again."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  return (
    <div className="flex h-40 items-center justify-center gap-2 text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> Creating note…
    </div>
  );
}

export default function NewNotePage() {
  return (
    <Suspense>
      <NewNoteContent />
    </Suspense>
  );
}
