"use client";

import Link from "next/link";
import { LayoutTemplate, ListChecks, RadioTower, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useVulnDashboardSummary } from "@/features/vuln/hooks/use-vuln";
import { VulnSeverityChart } from "@/features/vuln/components/vuln-severity-chart";
import { VulnScannerStatusList } from "@/features/vuln/components/vuln-scanner-status-list";
import { VulnFindingsTable } from "@/features/vuln/components/vuln-findings-table";
import { PageHelp } from "@/components/common/page-help";

/// Workspace-wide "Vulnerability Dashboard" — analog of the Recon landing
/// page, but built around one aggregate query (GetVulnDashboardSummary)
/// instead of a plain job list, since the spec calls for severity charts
/// / scanner status / running jobs / recent findings all on one screen.
export default function VulnDashboardPage() {
  const { data: summary, isLoading } = useVulnDashboardSummary();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <ShieldAlert className="size-6" /> Vulnerabilities
            <PageHelp
              summary="This is where actual weaknesses are found and tracked — different from Recon (which only maps out what exists). Vulnerability scans test the targets and URLs Recon discovered for real security issues, and every result lands here as a finding with a severity rating."
              steps={[
                "Pick a scanner under \"Scanners\" and a target to test, or apply a saved template under \"Templates\" to run several checks at once.",
                "Track progress under \"Scan jobs\" while it runs.",
                "Triage results here or under \"Findings\" — confirm real issues, mark false positives, and hand confirmed ones to Bug Bounty or Reports.",
              ]}
              actions={[
                { label: "Scan jobs", description: "Every vulnerability scan run across your projects — status, progress, and logs." },
                { label: "Templates", description: "Reusable bundles of scanner configs so you don't set up the same checks every time." },
                { label: "Scanners", description: "Which scanning tools are available and their current status." },
                { label: "Findings by severity / Recent findings", description: "A quick read on what's Critical/High right now, and the newest results to triage first." },
              ]}
            />
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Findings and scan activity across every project. Start new scans from a target&apos;s page.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link href="/vuln/jobs">
              <ListChecks className="size-4" /> Scan jobs
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/vuln/templates">
              <LayoutTemplate className="size-4" /> Templates
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/vuln/scanners">
              <RadioTower className="size-4" /> Scanners
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="Total findings" value={summary?.totalFindings} isLoading={isLoading} />
        <SummaryCard label="Running jobs" value={summary?.runningJobsCount} isLoading={isLoading} />
        <SummaryCard
          label="Critical + High"
          value={
            summary ? (summary.severityCounts.CRITICAL ?? 0) + (summary.severityCounts.HIGH ?? 0) : undefined
          }
          isLoading={isLoading}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Findings by severity</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading || !summary ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <VulnSeverityChart counts={summary.severityCounts} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scanner status</CardTitle>
          </CardHeader>
          <CardContent>
            <VulnScannerStatusList entries={summary?.scannerHistory} isLoading={isLoading} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">Recent findings</CardTitle>
          <Button size="sm" variant="outline" asChild>
            <Link href="/vuln/findings">View all →</Link>
          </Button>
        </CardHeader>
        <CardContent>
          <VulnFindingsTable
            findings={summary?.recentFindings}
            isLoading={isLoading}
            showTarget
            emptyDescription="Findings will appear here as scans complete."
          />
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  isLoading,
}: {
  label: string;
  value: number | undefined;
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs text-muted-foreground">{label}</p>
        {isLoading || value === undefined ? (
          <Skeleton className="mt-1 h-8 w-16" />
        ) : (
          <p className="mt-1 text-2xl font-semibold">{value}</p>
        )}
      </CardContent>
    </Card>
  );
}
