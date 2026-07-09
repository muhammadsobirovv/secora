"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { ProjectStatusBadge } from "./project-status-badge";
import type { ProjectDto } from "@pentesthub/shared";

export function ProjectTable({ projects }: { projects: ProjectDto[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead />
          <TableHead>Name</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Tags</TableHead>
          <TableHead>Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {projects.map((project) => (
          <TableRow key={project.id}>
            <TableCell>
              <Star
                className={cn(
                  "size-4",
                  project.isFavorite ? "fill-warning text-warning" : "text-transparent",
                )}
              />
            </TableCell>
            <TableCell>
              <Link href={`/projects/${project.id}`} className="font-medium hover:underline">
                {project.name}
              </Link>
            </TableCell>
            <TableCell>
              <ProjectStatusBadge status={project.status} />
            </TableCell>
            <TableCell>
              <div className="flex gap-1">
                {project.tags.map((tag) => (
                  <Badge key={tag.id} variant="outline">
                    {tag.name}
                  </Badge>
                ))}
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground">{formatDate(project.createdAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
