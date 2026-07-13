"use client";

import { Radar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRecentReconJobs } from "@/features/recon/hooks/use-recon";
import { ReconJobList } from "@/features/recon/components/recon-job-list";

/// Workspace-wide recon landing page — "Recent Scans" from the dashboard
/// spec. Unlike Evidence/Notes, recon jobs aren't picked-project-first: a
/// pentester wants to see what's running right now across every project,
/// then drill into a job or jump to its target/project.
export default function ReconLandingPage() {
  const { data: jobs, isLoading } = useRecentReconJobs();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Radar className="size-6" /> Recon
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Recent scans across every project. Start new scans from a target&apos;s page.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent scans</CardTitle>
        </CardHeader>
        <CardContent>
          <ReconJobList
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
