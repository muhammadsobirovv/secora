"use client";

import { ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRecentVulnScanJobs } from "@/features/vuln/hooks/use-vuln";
import { VulnScanJobList } from "@/features/vuln/components/vuln-scan-job-list";
import { useI18n } from "@/features/i18n/i18n-context";

export default function VulnScanJobsPage() {
  const { t } = useI18n();
  const { data: jobs, isLoading } = useRecentVulnScanJobs();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <ShieldAlert className="size-6" /> {t("vuln.nav.scanJobs")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("vuln.dashboard.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("recon.landing.recentScans")}</CardTitle>
        </CardHeader>
        <CardContent>
          <VulnScanJobList jobs={jobs} isLoading={isLoading} showTarget emptyDescription={t("recon.landing.emptyDescription")} />
        </CardContent>
      </Card>
    </div>
  );
}
