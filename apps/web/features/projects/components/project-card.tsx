"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/features/i18n/i18n-context";
import { useToggleFavoriteProject } from "../hooks/use-projects";
import { ProjectStatusBadge } from "./project-status-badge";
import type { ProjectDto } from "@pentesthub/shared";

export function ProjectCard({ project }: { project: ProjectDto }) {
  const { t } = useI18n();
  const toggleFavorite = useToggleFavoriteProject();

  return (
    <Card className="group relative transition-shadow hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="min-w-0">
            <Link href={`/projects/${project.id}`} className="truncate hover:underline">
              {project.name}
            </Link>
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            aria-label={project.isFavorite ? t("project.unfavorite") : t("project.favorite")}
            onClick={() => toggleFavorite.mutate({ id: project.id, isFavorite: project.isFavorite })}
          >
            <Star
              className={cn(
                "size-4",
                project.isFavorite ? "fill-warning text-warning" : "text-muted-foreground",
              )}
            />
          </Button>
        </div>
        {project.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">{project.description}</p>
        )}
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        <ProjectStatusBadge status={project.status} />
        {project.tags.slice(0, 3).map((tag) => (
          <Badge key={tag.id} variant="outline" style={{ borderColor: tag.color ?? undefined }}>
            {tag.name}
          </Badge>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">{formatDate(project.createdAt)}</span>
      </CardContent>
    </Card>
  );
}
