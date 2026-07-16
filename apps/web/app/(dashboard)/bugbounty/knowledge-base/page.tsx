"use client";

import * as React from "react";
import { BookOpen, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";
import {
  useCreateKnowledgeBaseNote,
  useDeleteKnowledgeBaseNote,
  useKnowledgeBaseNotes,
} from "@/features/bugbounty/hooks/use-bugbounty";

function CreateNoteDialog() {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [contentMarkdown, setContentMarkdown] = React.useState("");
  const createNote = useCreateKnowledgeBaseNote();

  async function handleSubmit(): Promise<void> {
    try {
      await createNote.mutateAsync({ title: title || undefined, contentMarkdown });
      toast.success("Note created");
      setOpen(false);
      setTitle("");
      setContentMarkdown("");
    } catch {
      toast.error("Couldn't create this note.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> New note
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New knowledge base note</DialogTitle>
          <DialogDescription>Personal notes, techniques, and checklists.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div>
            <Label htmlFor="note-title">Title</Label>
            <Input id="note-title" value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="note-content">Content (Markdown)</Label>
            <Textarea
              id="note-content"
              value={contentMarkdown}
              onChange={(e) => setContentMarkdown(e.target.value)}
              className="mt-1"
              rows={8}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => void handleSubmit()} disabled={!contentMarkdown || createNote.isPending}>
            {createNote.isPending && <Loader2 className="size-4 animate-spin" />}
            Create note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function KnowledgeBasePage() {
  const [search, setSearch] = React.useState("");
  const { data: notes, isLoading } = useKnowledgeBaseNotes({ search: search || undefined });
  const deleteNote = useDeleteKnowledgeBaseNote();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <BookOpen className="size-6" /> Knowledge Base
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Your personal notes and checklists.</p>
        </div>
        <CreateNoteDialog />
      </div>

      <Input placeholder="Search notes..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : !notes?.length ? (
        <EmptyState icon={BookOpen} title="No notes yet" description="Create a note to start building your knowledge base." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((note) => (
            <Card key={note.id}>
              <CardContent className="flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{note.title ?? "Untitled"}</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void deleteNote.mutateAsync(note.id).then(() => toast.success("Deleted"))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <p className="line-clamp-4 whitespace-pre-wrap text-sm text-muted-foreground">{note.contentMarkdown}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
