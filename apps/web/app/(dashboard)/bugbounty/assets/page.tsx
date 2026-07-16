"use client";

import * as React from "react";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Target } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";
import { useAssetInventory, useBugBountyPrograms } from "@/features/bugbounty/hooks/use-bugbounty";
import { ScopeClassificationBadge } from "@/features/bugbounty/components/bugbounty-badges";

function BugBountyAssetsContent() {
  const searchParams = useSearchParams();
  const [programId, setProgramId] = React.useState(searchParams.get("programId") ?? "");
  const { data: programs } = useBugBountyPrograms();
  const { data: assets, isLoading } = useAssetInventory({ programId: programId || undefined });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Target className="size-6" /> Asset Inventory
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Targets aggregated with recon, vulnerability, note, and evidence data.
        </p>
      </div>

      <Select value={programId} onValueChange={setProgramId}>
        <SelectTrigger className="w-64">
          <SelectValue placeholder="Select a program" />
        </SelectTrigger>
        <SelectContent>
          {programs?.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!programId ? (
        <EmptyState icon={Target} title="Select a program" description="Choose a program above to see its asset inventory." />
      ) : isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : !assets?.length ? (
        <EmptyState icon={Target} title="No assets found" description="Link targets to this program to see them here." />
      ) : (
        <Card>
          <CardContent className="flex flex-col divide-y divide-border p-0">
            {assets.map((asset) => (
              <div key={asset.targetId} className="flex flex-col gap-2 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{asset.value}</span>
                  <div className="flex items-center gap-2">
                    {asset.scopeClassification && <ScopeClassificationBadge classification={asset.scopeClassification} />}
                    <span className="text-xs text-muted-foreground">Risk {asset.riskScore}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{asset.findingsCount} vuln findings ({asset.criticalFindingsCount} critical)</span>
                  <span>{asset.openPorts.length} open ports</span>
                  <span>{asset.technology.length} technologies</span>
                  <span>{asset.notesCount} notes</span>
                  <span>{asset.evidenceCount} evidence</span>
                  {asset.lastScanAt && <span>Last scan {new Date(asset.lastScanAt).toLocaleDateString()}</span>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function BugBountyAssetsPage() {
  return (
    <Suspense>
      <BugBountyAssetsContent />
    </Suspense>
  );
}
