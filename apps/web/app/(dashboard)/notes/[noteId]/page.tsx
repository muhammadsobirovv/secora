"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ErrorState } from "@/components/common/error-state";
import { useDeleteNote, useNote, useUpdateNote } from "@/features/notes/hooks/use-notes";
import { NoteEditor } from "@/features/notes/components/note-editor";

export default function NoteDetailPage({ params }: { params: Promise<{ noteId: string }> }) {
  const { noteId } = use(params);
  const router = useRouter();
  const { data: note, isLoading, isError, refetch } = useNote(noteId);
  const updateNote = useUpdateNote(noteId);
  const deleteNote = useDeleteNote();
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleDelete() {
    if (!note) return;
    try {
      await deleteNote.mutateAsync(noteId);
      toast.success("Note deleted");
      router.push(`/projects/${note.projectId}?tab=notes`);
    } catch {
      toast.error("Something went wrong.");
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (isError || !note) {
    return <ErrorState description="Couldn't load this note." onRetry={() => void refetch()} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Link
          href={`/projects/${note.projectId}?tab=notes`}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← Back to project
        </Link>
        <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(true)} aria-label="Delete note">
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </div>

      <NoteEditor note={note} onSave={(data) => updateNote.mutateAsync(data).then(() => undefined)} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this note?</AlertDialogTitle>
            <AlertDialogDescription>This can&apos;t be undone from the dashboard.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleDelete()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
