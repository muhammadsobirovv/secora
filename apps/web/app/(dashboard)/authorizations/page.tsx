"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileCheck2, Loader2, MailCheck, Plus, ScanSearch, XCircle } from "lucide-react";
import type { RoeAuthorizationDto } from "@pentesthub/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { useI18n } from "@/features/i18n/i18n-context";
import { roeErrorKey } from "@/features/scan/roe-errors";
import * as roeApi from "@/lib/api/roe";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<RoeAuthorizationDto["status"], string> = {
  PENDING: "border-warning/40 bg-warning/10 text-foreground",
  ACTIVE: "border-success/40 bg-success/10 text-foreground",
  DECLINED: "border-border text-muted-foreground",
  EXPIRED: "border-border text-muted-foreground",
  REVOKED: "border-destructive/40 bg-destructive/10 text-foreground",
  CANCELLED: "border-border text-muted-foreground",
};

/// Every client request: its status, assets and window, with the actions that
/// make sense for it (send again, end it, download the evidence, scan).
export default function AuthorizationsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ["roe", "list"],
    queryFn: roeApi.listRoe,
    refetchInterval: (query) => (query.state.data?.some((item) => item.status === "PENDING") ? 30_000 : false),
  });

  const refresh = (next: RoeAuthorizationDto) => {
    queryClient.setQueryData(["roe", next.id], next);
    queryClient.setQueryData<RoeAuthorizationDto[]>(["roe", "list"], (all) => all?.map((item) => (item.id === next.id ? next : item)));
  };
  const resend = useMutation({
    mutationFn: roeApi.resendRoe,
    onSuccess: (next) => {
      refresh(next);
      toast.success(t("roe.waiting.resent"));
    },
    onError: (error) => toast.error(t(roeErrorKey(error))),
  });
  const cancel = useMutation({
    mutationFn: roeApi.cancelRoe,
    onSuccess: (next) => {
      refresh(next);
      toast.success(t("roe.waiting.cancelled"));
    },
    onError: (error) => toast.error(t(roeErrorKey(error))),
  });

  async function downloadEvidence(item: RoeAuthorizationDto) {
    try {
      const blob = await roeApi.downloadRoeEvidence(item.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = item.evidenceName ?? "evidence";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(t(roeErrorKey(error)));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <FileCheck2 className="size-6 shrink-0" aria-hidden="true" /> {t("roe.list.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("roe.list.subtitle")}</p>
        </div>
        <Button asChild className="h-11">
          <Link href="/dashboard?roe=new#quick-scan">
            <Plus aria-hidden="true" /> {t("roe.list.new")}
          </Link>
        </Button>
      </div>

      {list.isLoading && (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      )}
      {list.isError && <ErrorState title={t("common.error")} description={t("roe.list.loadError")} onRetry={() => void list.refetch()} />}
      {list.data && list.data.length === 0 && <EmptyState icon={FileCheck2} title={t("roe.list.empty")} />}

      <ul className="flex flex-col gap-3">
        {list.data?.map((item) => {
          const canResend = item.canResendAt !== null && new Date(item.canResendAt).getTime() <= Date.now();
          const canEnd = item.status === "PENDING" || item.status === "ACTIVE";
          return (
            <li key={item.id}>
              <Card>
                <CardContent className="flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium break-words">{item.clientName}</p>
                      <p className="text-xs break-all text-muted-foreground">{item.clientEmail}</p>
                    </div>
                    <span className={cn("shrink-0 rounded-full border px-2.5 py-0.5 text-xs", STATUS_CLASS[item.status])}>
                      {t(`roe.status.${item.status}` as const)}
                    </span>
                  </div>

                  <ul className="flex flex-col gap-1 text-sm">
                    {item.assets.map((asset) => (
                      <li key={asset.id} className="flex flex-wrap items-center gap-x-2 break-all">
                        <span className="font-mono text-xs">{asset.value}</span>
                        {asset.wildcard && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs">{t("roe.list.wildcardTag")}</span>}
                      </li>
                    ))}
                  </ul>

                  <p className="text-xs text-muted-foreground">
                    {t("roe.list.range", { start: formatDateTime(item.windowStart), end: formatDateTime(item.windowEnd) })}
                    {item.approvedAt && ` · ${t("roe.list.approvedAt", { time: formatDateTime(item.approvedAt) })}`}
                  </p>

                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    {item.status === "ACTIVE" && (
                      <Button asChild className="h-11">
                        <Link href={`/dashboard?roe=${item.id}#quick-scan`}>
                          <ScanSearch aria-hidden="true" /> {t("roe.list.scan")}
                        </Link>
                      </Button>
                    )}
                    {item.canResendAt !== null && (
                      <Button
                        variant="outline"
                        className="h-11"
                        disabled={!canResend || resend.isPending}
                        onClick={() => resend.mutate(item.id)}
                      >
                        {resend.isPending && resend.variables === item.id ? <Loader2 className="animate-spin" aria-hidden="true" /> : <MailCheck aria-hidden="true" />}
                        {t("roe.waiting.resend")}
                      </Button>
                    )}
                    {item.hasEvidence && (
                      <Button variant="outline" className="h-11" onClick={() => void downloadEvidence(item)}>
                        <Download aria-hidden="true" /> {t("roe.list.evidence")}
                      </Button>
                    )}
                    {canEnd && (
                      <Button
                        variant="ghost"
                        className="h-11"
                        disabled={cancel.isPending}
                        onClick={() => {
                          if (item.status === "PENDING" || window.confirm(t("roe.list.cancelConfirm"))) cancel.mutate(item.id);
                        }}
                      >
                        <XCircle aria-hidden="true" /> {t(item.status === "PENDING" ? "roe.waiting.cancel" : "roe.list.cancelAction")}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
