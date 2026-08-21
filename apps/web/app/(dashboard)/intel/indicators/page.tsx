"use client";

import * as React from "react";
import { Search, Radar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIndicators } from "@/features/intel/hooks/use-indicators";
import { useWorkspace } from "@/features/workspace/hooks/use-workspace";
import { IndicatorsTable } from "@/features/intel/components/indicators-table";
import { CreateIndicatorDialog } from "@/features/intel/components/create-indicator-dialog";
import type { IndicatorStatus, IndicatorType } from "@pentesthub/shared";

const INDICATOR_TYPES: IndicatorType[] = [
  "IP",
  "DOMAIN",
  "URL",
  "HASH",
  "EMAIL",
  "CVE",
  "CPE",
  "ASN",
  "CERTIFICATE",
  "FILE",
  "MALWARE_FAMILY",
];
const INDICATOR_STATUSES: IndicatorStatus[] = ["ACTIVE", "EXPIRED", "DISABLED"];

/// Module 17 — task #467 (Indicator management, frontend half). Same
/// server-filtered pattern as VulnFindingsPage: type/status/search all
/// become ListIndicatorsParams so the API filters, not the client. Lists
/// both this workspace's own private indicators and the shared public
/// cache (see IndicatorsTable's own comment on why only own-workspace
/// rows get an editable status control).
export default function IndicatorsPage() {
  const [type, setType] = React.useState<IndicatorType | "ALL">("ALL");
  const [status, setStatus] = React.useState<IndicatorStatus | "ALL">("ALL");
  const [search, setSearch] = React.useState("");

  const { data: workspace } = useWorkspace();
  const { data: indicators, isLoading } = useIndicators({
    ...(type !== "ALL" ? { type } : {}),
    ...(status !== "ALL" ? { status } : {}),
    ...(search ? { search } : {}),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Radar className="size-6" /> Indicators
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Indicators of compromise from provider feeds, STIX/TAXII imports, and manual entry — shown with
            confidence and source, never as confirmed compromise.
          </p>
        </div>
        <CreateIndicatorDialog />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search indicators…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 pl-8"
          />
        </div>
        <Select value={type} onValueChange={(v) => setType(v as IndicatorType | "ALL")}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All types</SelectItem>
            {INDICATOR_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as IndicatorStatus | "ALL")}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {INDICATOR_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {indicators ? `${indicators.length} indicator${indicators.length === 1 ? "" : "s"}` : "Indicators"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <IndicatorsTable indicators={indicators} isLoading={isLoading} workspaceId={workspace?.id} />
        </CardContent>
      </Card>
    </div>
  );
}
