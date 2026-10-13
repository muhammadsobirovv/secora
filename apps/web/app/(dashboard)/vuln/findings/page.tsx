"use client";

import * as React from "react";
import { Search, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useVulnFindings } from "@/features/vuln/hooks/use-vuln";
import { VulnFindingsTable } from "@/features/vuln/components/vuln-findings-table";
import { useI18n } from "@/features/i18n/i18n-context";
import type {
  ListVulnFindingsQueryDto,
  VulnFindingSeverity,
  VulnFindingStatus,
  VulnScanner,
} from "@pentesthub/shared";

const SEVERITIES: VulnFindingSeverity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];
const STATUSES: VulnFindingStatus[] = [
  "NEW",
  "CONFIRMED",
  "DUPLICATE",
  "ACCEPTED_RISK",
  "FIXED",
  "FALSE_POSITIVE",
];
const SCANNERS: VulnScanner[] = ["NUCLEI", "FFUF", "DIRSEARCH", "FEROXBUSTER", "NIKTO"];

/// "Findings" page — workspace-wide, server-filtered (severity/status/
/// scanner/search all become ListVulnFindingsQueryDto params so the API
/// does the filtering, not the client) with bulk actions enabled on the
/// table. "/" focuses the search box — a lightweight keyboard shortcut
/// per the frontend spec's "Keyboard Shortcuts" requirement.
export default function VulnFindingsPage() {
  const { t, plural } = useI18n();
  const [severity, setSeverity] = React.useState<VulnFindingSeverity | "ALL">("ALL");
  const [status, setStatus] = React.useState<VulnFindingStatus | "ALL">("ALL");
  const [scanner, setScanner] = React.useState<VulnScanner | "ALL">("ALL");
  const [search, setSearch] = React.useState("");
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const query: ListVulnFindingsQueryDto = {
    ...(severity !== "ALL" ? { severity } : {}),
    ...(status !== "ALL" ? { status } : {}),
    ...(scanner !== "ALL" ? { scanner } : {}),
    ...(search ? { search } : {}),
  };
  const { data: findings, isLoading } = useVulnFindings(query);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <ShieldAlert className="size-6" /> {t("vuln.findings.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("vuln.findings.subtitle")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            placeholder={t("vuln.findings.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 pl-8"
          />
        </div>
        <Select value={severity} onValueChange={(v) => setSeverity(v as VulnFindingSeverity | "ALL")}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t("vuln.findings.col.severity")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("vuln.findings.allSeverities")}</SelectItem>
            {SEVERITIES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`severity.${s}` as const)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as VulnFindingStatus | "ALL")}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t("vuln.findings.col.status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("vuln.findings.allStatuses")}</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`vuln.status.${s}` as const)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={scanner} onValueChange={(v) => setScanner(v as VulnScanner | "ALL")}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t("vuln.findings.col.scanner")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("vuln.findings.allScanners")}</SelectItem>
            {SCANNERS.map((s) => (
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
            {findings ? plural("vuln.findings.count", findings.length) : t("vuln.findings.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <VulnFindingsTable findings={findings} isLoading={isLoading} showTarget enableBulkActions />
        </CardContent>
      </Card>
    </div>
  );
}
