"use client";

import Link from "next/link";
import { FolderKanban, Settings, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace, useWorkspaceMembers } from "@/features/workspace/hooks/use-workspace";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { WorkspaceAvatar } from "@/features/workspace/components/workspace-avatar";
import { formatDate } from "@/lib/format";

export default function WorkspaceOverviewPage() {
  const { data: workspace, isLoading } = useWorkspace();
  const { data: members, isLoading: membersLoading } = useWorkspaceMembers();
  const { data: projects } = useProjects();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Workspace</h1>
        <Button variant="outline" asChild>
          <Link href="/settings/workspace">
            <Settings className="size-4" /> Settings
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="flex items-center gap-4 pt-6">
          {isLoading ? (
            <>
              <Skeleton className="size-14 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-64" />
              </div>
            </>
          ) : (
            <>
              <WorkspaceAvatar workspace={workspace} className="size-14" />
              <div>
                <h2 className="text-lg font-semibold">{workspace?.name}</h2>
                {workspace?.description && (
                  <p className="text-sm text-muted-foreground">{workspace.description}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  Created {workspace && formatDate(workspace.createdAt)}
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <FolderKanban className="size-5 text-primary" />
            <div>
              <p className="text-xl font-semibold">{projects?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Projects</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <Users className="size-5 text-primary" />
            <div>
              <p className="text-xl font-semibold">{members?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Members</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          {membersLoading ? (
            <div className="space-y-2 py-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            members?.map((member) => (
              <div key={member.userId} className="flex items-center justify-between py-3">
                <span className="font-mono text-xs text-muted-foreground">{member.userId}</span>
                <Badge variant={member.role === "OWNER" ? "default" : "outline"}>{member.role}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
