"use client";

import { FileBarChart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSecurityReports } from "@/features/security-reports/hooks/use-security-reports";
import { SecurityReportsTable } from "@/features/security-reports/components/security-reports-table";
import { GenerateReportDialog } from "@/features/security-reports/components/generate-report-dialog";

/// Module 17 — task #481 (Security Reporting extensions / Report
/// Builder). See SecurityReportingService's doc comment for why this is
/// a new, workspace-scoped report generator rather than an extension of
/// the bugbounty Report Builder or the Organization-scoped Enterprise
/// Reporting.
export default function SecurityReportsPage() {
  const { data: reports, isLoading } = useSecurityReports();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <FileBarChart className="size-6" /> Security Reports
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Point-in-time incident, threat intel, and posture summary reports for this workspace.
          </p>
        </div>
        <GenerateReportDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {reports ? `${reports.length} report${reports.length === 1 ? "" : "s"}` : "Reports"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SecurityReportsTable reports={reports} isLoading={isLoading} />
        </CardContent>
      </Card>
    </div>
  );
}
