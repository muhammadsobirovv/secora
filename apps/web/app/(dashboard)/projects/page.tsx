"use client";

import * as React from "react";
import Link from "next/link";
import { FolderKanban, LayoutGrid, Plus, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CardGridSkeleton } from "@/components/common/skeletons";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { ProjectCard } from "@/features/projects/components/project-card";
import { ProjectTable } from "@/features/projects/components/project-table";
import type { ProjectStatus } from "@pentesthub/shared";

export default function ProjectsPage() {
  const [view, setView] = React.useState<"cards" | "table">("cards");
  const [status, setStatus] = React.useState<ProjectStatus | "ALL">("ALL");
  const { data: projects, isLoading, isError, refetch } = useProjects(
    status === "ALL" ? {} : { status },
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus | "ALL")}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="ON_HOLD">On hold</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="ARCHIVED">Archived</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex rounded-md border border-input">
            <Button
              variant={view === "cards" ? "secondary" : "ghost"}
              size="icon"
              className="rounded-r-none"
              onClick={() => setView("cards")}
              aria-label="Card view"
            >
              <LayoutGrid className="size-4" />
            </Button>
            <Button
              variant={view === "table" ? "secondary" : "ghost"}
              size="icon"
              className="rounded-l-none"
              onClick={() => setView("table")}
              aria-label="Table view"
            >
              <Table2 className="size-4" />
            </Button>
          </div>
          <Button asChild>
            <Link href="/projects/new">
              <Plus className="size-4" /> New project
            </Link>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <CardGridSkeleton />
      ) : isError ? (
        <ErrorState description="Couldn't load projects." onRetry={() => void refetch()} />
      ) : !projects || projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="Create your first project to start tracking targets, notes, and evidence."
          action={
            <Button asChild size="sm">
              <Link href="/projects/new">
                <Plus className="size-4" /> New project
              </Link>
            </Button>
          }
        />
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      ) : (
        <ProjectTable projects={projects} />
      )}
    </div>
  );
}
