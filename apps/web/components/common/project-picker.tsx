"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { FolderKanban } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { CardGridSkeleton } from "@/components/common/skeletons";
import { EmptyState } from "@/components/common/empty-state";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { ProjectStatusBadge } from "@/features/projects/components/project-status-badge";

/// Targets/Notes/Evidence are project-scoped resources in the API (list
/// endpoints all require a projectId — there's no workspace-wide "all
/// targets" endpoint, deliberately: keeping that list small and
/// per-project is the right shape for how pentest engagements are
/// actually organized). This is the shared "pick a project to continue"
/// landing used by all three top-level sidebar entries, linking into
/// that project's detail page with the relevant tab pre-selected.
export function ProjectPicker({
  icon: Icon,
  description,
  hrefFor,
}: {
  icon: LucideIcon;
  description: string;
  hrefFor: (projectId: string) => string;
}) {
  const { data: projects, isLoading } = useProjects();

  if (isLoading) return <CardGridSkeleton />;

  if (!projects || projects.length === 0) {
    return (
      <EmptyState
        icon={FolderKanban}
        title="No projects yet"
        description="Create a project first — this is where its targets, notes, and evidence will live."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4" />
        {description}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <Link key={project.id} href={hrefFor(project.id)}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardContent className="flex items-center justify-between gap-2 pt-6">
                <span className="truncate font-medium">{project.name}</span>
                <ProjectStatusBadge status={project.status} />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
