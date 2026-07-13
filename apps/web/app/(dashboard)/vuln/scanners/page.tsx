"use client";

import { RadioTower } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useVulnScannerHistory } from "@/features/vuln/hooks/use-vuln";
import { VulnScannerStatusList } from "@/features/vuln/components/vuln-scanner-status-list";

export default function VulnScannerHistoryPage() {
  const { data: entries, isLoading } = useVulnScannerHistory();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <RadioTower className="size-6" /> Scanner history
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Run counts and findings totals for every scanner used in this workspace.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scanners</CardTitle>
        </CardHeader>
        <CardContent>
          <VulnScannerStatusList entries={entries} isLoading={isLoading} />
        </CardContent>
      </Card>
    </div>
  );
}
