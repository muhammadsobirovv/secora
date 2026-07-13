"use client";

import { LayoutTemplate } from "lucide-react";
import { useVulnScanTemplates } from "@/features/vuln/hooks/use-vuln";
import { VulnScanTemplatesList } from "@/features/vuln/components/vuln-scan-templates-list";
import { CreateVulnScanTemplateDialog } from "@/features/vuln/components/create-vuln-scan-template-dialog";

export default function VulnScanTemplatesPage() {
  const { data: templates, isLoading } = useVulnScanTemplates();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <LayoutTemplate className="size-6" /> Scan templates
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reusable scanner selections. Built-in templates can&apos;t be deleted.
          </p>
        </div>
        <CreateVulnScanTemplateDialog />
      </div>

      <VulnScanTemplatesList templates={templates} isLoading={isLoading} />
    </div>
  );
}
