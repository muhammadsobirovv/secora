"use client";

import { ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRecentVulnScanJobs } from "@/features/vuln/hooks/use-vuln";
import { VulnScanJobList } from "@/features/vuln/components/vuln-scan-job-list";

export default function VulnScanJobsPage() {
  const { data: jobs, isLoading } = useRecentVulnScanJobs();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <ShieldAlert className="size-6" /> Scan jobs
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Recent vulnerability scans across every project. Start new scans from a target&apos;s page.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent scans</CardTitle>
        </CardHeader>
        <CardContent>
          <VulnScanJobList
            jobs={jobs}
            isLoading={isLoading}
            showTarget
            emptyDescription="Start a scan from any target's page to see it here."
          />
        </CardContent>
      </Card>
    </div>
  );
}
