"use client";

import { RadioTower } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useVulnScannerHistory } from "@/features/vuln/hooks/use-vuln";
import { VulnScannerStatusList } from "@/features/vuln/components/vuln-scanner-status-list";
import { useI18n } from "@/features/i18n/i18n-context";

export default function VulnScannerHistoryPage() {
  const { t } = useI18n();
  const { data: entries, isLoading } = useVulnScannerHistory();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <RadioTower className="size-6" /> {t("vuln.scannerHistory.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("vuln.scannerHistory.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("vuln.nav.scanners")}</CardTitle>
        </CardHeader>
        <CardContent>
          <VulnScannerStatusList entries={entries} isLoading={isLoading} />
        </CardContent>
      </Card>
    </div>
  );
}
