"use client";

import { LayoutTemplate, Loader2, Lock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";
import { CardGridSkeleton } from "@/components/common/skeletons";
import { useI18n } from "@/features/i18n/i18n-context";
import { useDeleteVulnScanTemplate } from "../hooks/use-vuln";
import type { VulnScanTemplateDto } from "@pentesthub/shared";

export function VulnScanTemplatesList({
  templates,
  isLoading,
}: {
  templates: VulnScanTemplateDto[] | undefined;
  isLoading: boolean;
}) {
  const { t } = useI18n();
  const deleteTemplate = useDeleteVulnScanTemplate();

  async function handleDelete(id: string): Promise<void> {
    try {
      await deleteTemplate.mutateAsync(id);
      toast.success(t("vuln.template.deleted"));
    } catch {
      toast.error(t("vuln.template.deleteError"));
    }
  }

  if (isLoading) return <CardGridSkeleton count={3} />;

  if (!templates || templates.length === 0) {
    return (
      <EmptyState
        icon={LayoutTemplate}
        title={t("vuln.template.emptyTitle")}
        description={t("vuln.template.emptyDescription")}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {templates.map((template) => (
        <Card key={template.id}>
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              {template.name}
              {template.isBuiltIn && <Lock className="size-3.5 text-muted-foreground" />}
            </CardTitle>
            {!template.isBuiltIn && (
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                disabled={deleteTemplate.isPending}
                onClick={() => void handleDelete(template.id)}
                aria-label={t("vuln.template.delete")}
              >
                {deleteTemplate.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {template.description && (
              <p className="mb-2 text-sm text-muted-foreground">{template.description}</p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {template.scanners.map((scanner) => (
                <Badge key={scanner} variant="outline">
                  {scanner}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
