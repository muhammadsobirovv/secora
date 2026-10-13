"use client";

import { LayoutTemplate } from "lucide-react";
import { useVulnScanTemplates } from "@/features/vuln/hooks/use-vuln";
import { VulnScanTemplatesList } from "@/features/vuln/components/vuln-scan-templates-list";
import { CreateVulnScanTemplateDialog } from "@/features/vuln/components/create-vuln-scan-template-dialog";
import { useI18n } from "@/features/i18n/i18n-context";

export default function VulnScanTemplatesPage() {
  const { t } = useI18n();
  const { data: templates, isLoading } = useVulnScanTemplates();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <LayoutTemplate className="size-6" /> {t("vuln.template.pageTitle")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("vuln.template.pageSubtitle")}</p>
        </div>
        <CreateVulnScanTemplateDialog />
      </div>

      <VulnScanTemplatesList templates={templates} isLoading={isLoading} />
    </div>
  );
}
