"use client";

import * as React from "react";
import { Loader2, ShieldCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/features/i18n/i18n-context";
import { ApiError } from "@/lib/api/client";
import { formatDate } from "@/lib/format";
import { useAttestTargetAuthorization, useTargetAuthorization } from "../hooks/use-targets";
import {
  EMPTY_TARGET_AUTHORIZATION,
  TargetAuthorizationFields,
  toAttestRequest,
} from "./target-authorization-fields";

/// Shows whether the target is authorized for active scans and lets the
/// user add or renew the attestation (each save adds a new record).
export function TargetAuthorizationCard({ targetId }: { targetId: string }) {
  const { t } = useI18n();
  const { data: status, isLoading } = useTargetAuthorization(targetId);
  const attest = useAttestTargetAuthorization(targetId);
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(EMPTY_TARGET_AUTHORIZATION);

  const showForm = editing || (status !== undefined && !status.authorized);

  async function onSave() {
    try {
      await attest.mutateAsync(toAttestRequest(value));
      toast.success(t("targetAuth.saved"));
      setEditing(false);
      setValue(EMPTY_TARGET_AUTHORIZATION);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t("targetAuth.saveError"));
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {status?.authorized ? <ShieldCheck className="size-4" /> : <ShieldAlert className="size-4" />}
          {t("targetAuth.title")}
        </CardTitle>
        {status?.authorized && !editing && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            {t("targetAuth.renew")}
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoading ? (
          <Skeleton className="h-6 w-64" />
        ) : status?.authorized && status.current ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="success">{t(`targetAuth.basis.${status.current.basis}`)}</Badge>
            <span className="text-muted-foreground">
              {t("targetAuth.statusAuthorized").replace("{date}", formatDate(status.current.expiresAt))}
            </span>
          </div>
        ) : (
          <p className="text-sm text-destructive">
            {status?.reason === "EXPIRED" ? t("targetAuth.statusExpired") : t("targetAuth.statusMissing")}
          </p>
        )}
        <p className="text-xs text-muted-foreground">{t("targetAuth.passiveNote")}</p>

        {showForm && (
          <>
            <TargetAuthorizationFields idPrefix={`target-${targetId}`} value={value} onChange={setValue} />
            <div className="flex gap-2">
              <Button onClick={onSave} disabled={!value.attested || attest.isPending}>
                {attest.isPending && <Loader2 className="size-4 animate-spin" />}
                {t("targetAuth.save")}
              </Button>
              {editing && (
                <Button variant="ghost" onClick={() => setEditing(false)}>
                  ✕
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
