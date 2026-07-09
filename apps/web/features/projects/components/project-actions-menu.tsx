"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import * as React from "react";
import { useArchiveProject, useDeleteProject } from "../hooks/use-projects";
import type { ProjectDto } from "@pentesthub/shared";

export function ProjectActionsMenu({ project }: { project: ProjectDto }) {
  const router = useRouter();
  const archiveProject = useArchiveProject();
  const deleteProject = useDeleteProject();
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  async function handleArchive() {
    try {
      await archiveProject.mutateAsync(project.id);
      toast.success(project.status === "ARCHIVED" ? "Project unarchived" : "Project archived");
    } catch {
      toast.error("Something went wrong.");
    }
  }

  async function handleDelete() {
    try {
      await deleteProject.mutateAsync(project.id);
      toast.success("Project deleted");
      router.push("/projects");
    } catch {
      toast.error("Something went wrong.");
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Project actions">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => router.push(`/projects/${project.id}/edit`)}>
            <Pencil className="size-4" /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void handleArchive()}>
            {project.status === "ARCHIVED" ? (
              <>
                <ArchiveRestore className="size-4" /> Unarchive
              </>
            ) : (
              <>
                <Archive className="size-4" /> Archive
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{project.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This soft-deletes the project — it can be restored later from the API, but won&apos;t
              appear in your project list.
            </AlertDialogDescription>
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
    </>
  );
}
