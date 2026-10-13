"use client";

import { Radar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRecentReconJobs } from "@/features/recon/hooks/use-recon";
import { ReconJobList } from "@/features/recon/components/recon-job-list";
import { PageHelp } from "@/components/common/page-help";
import { useI18n } from "@/features/i18n/i18n-context";

/// Workspace-wide recon landing page — "Recent Scans" from the dashboard
/// spec. Unlike Evidence/Notes, recon jobs aren't picked-project-first: a
/// pentester wants to see what's running right now across every project,
/// then drill into a job or jump to its target/project.
export default function ReconLandingPage() {
  const { t } = useI18n();
  const { data: jobs, isLoading } = useRecentReconJobs();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Radar className="size-6" /> {t("nav.recon")}
          <PageHelp
            summary={t("recon.landing.helpSummary")}
            steps={[t("recon.landing.step1"), t("recon.landing.step2"), t("recon.landing.step3")]}
            actions={[
              { label: t("recon.landing.recentScans"), description: t("recon.landing.actionScansDescription") },
              { label: t("recon.job.target"), description: t("recon.landing.actionTargetDescription") },
            ]}
          />
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("recon.landing.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("recon.landing.recentScans")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ReconJobList
            jobs={jobs}
            isLoading={isLoading}
            showTarget
            emptyDescription={t("recon.landing.emptyDescription")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
