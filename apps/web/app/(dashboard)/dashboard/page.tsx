"use client";

import Link from "next/link";
import {
  Activity as ActivityIcon,
  Building2,
  FolderKanban,
  Plus,
  Search,
  Settings,
  Star,
  Tags,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState } from "@/components/common/empty-state";
import { CardGridSkeleton } from "@/components/common/skeletons";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useI18n } from "@/features/i18n/i18n-context";
import { useWorkspace, useWorkspaceMembers } from "@/features/workspace/hooks/use-workspace";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { useTags } from "@/features/tags/hooks/use-tags";
import { useActivity } from "@/features/activity/hooks/use-activity";
import { useUiStore } from "@/lib/stores/ui-store";
import { ProjectCard } from "@/features/projects/components/project-card";
import { ActivityFeed } from "@/features/activity/components/activity-feed";
import { WorkspaceAvatar } from "@/features/workspace/components/workspace-avatar";

// Moved here from app/(dashboard)/page.tsx — "/" is now the public
// marketing landing page (SEO fix: an authenticated app screen can't be
// crawled/indexed, and there was previously no public homepage at all).
// The authenticated dashboard home now lives at "/dashboard"; proxy.ts
// redirects signed-in visitors from "/" to here at the edge.
export default function DashboardHomePage() {
  const { t, plural } = useI18n();
  const { user } = useAuth();
  const { data: workspace } = useWorkspace();
  const { data: members } = useWorkspaceMembers();
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const { data: tags } = useTags();
  const { data: activity, isLoading: activityLoading } = useActivity({ limit: 8 });
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);

  const recentProjects = (projects ?? []).slice(0, 6);
  const favoriteCount = (projects ?? []).filter((p) => p.isFavorite).length;
  const memberCount = members?.length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {user
              ? t("dashboard.welcomeName", { name: user.displayName.split(" ")[0] ?? "" })
              : t("dashboard.welcome")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("dashboard.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setCommandPaletteOpen(true)}>
            <Search className="size-4" /> {t("common.search")}
          </Button>
          <Button asChild>
            <Link href="/projects/new">
              <Plus className="size-4" /> {t("dashboard.newProject")}
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={t("dashboard.stats.projects")}
          value={projects?.length ?? 0}
          icon={FolderKanban}
          isLoading={projectsLoading}
        />
        <StatCard
          label={t("dashboard.stats.favorites")}
          value={favoriteCount}
          icon={Star}
          isLoading={projectsLoading}
        />
        <StatCard label={t("dashboard.stats.tags")} value={tags?.length ?? 0} icon={Tags} />
        <StatCard label={t("dashboard.stats.teamMembers")} value={memberCount} icon={Users} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">{t("dashboard.recentProjects")}</h2>
            <Button variant="link" asChild className="h-auto p-0">
              <Link href="/projects">{t("common.viewAll")}</Link>
            </Button>
          </div>
          {projectsLoading ? (
            <CardGridSkeleton count={4} />
          ) : recentProjects.length === 0 ? (
            <EmptyState
              icon={FolderKanban}
              title={t("dashboard.empty.title")}
              description={t("dashboard.empty.description")}
              action={
                <Button asChild size="sm">
                  <Link href="/projects/new">
                    <Plus className="size-4" /> {t("dashboard.newProject")}
                  </Link>
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {recentProjects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="size-4" /> {t("dashboard.workspace")}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <WorkspaceAvatar workspace={workspace} className="size-10" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{workspace?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {plural("dashboard.members", memberCount)}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" asChild>
                  <Link href="/workspace">{t("dashboard.overview")}</Link>
                </Button>
                <Button variant="outline" size="sm" className="flex-1" asChild>
                  <Link href="/settings/workspace">
                    <Settings className="size-3.5" /> {t("nav.settings")}
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ActivityIcon className="size-4" /> {t("dashboard.recentActivity")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityFeed events={activity} isLoading={activityLoading} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
