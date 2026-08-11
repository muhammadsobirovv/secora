"use client";

import {
  Boxes,
  Database,
  HardDrive,
  KeyRound,
  Layers,
  Puzzle,
  Server,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard } from "@/components/common/stat-card";
import { CardGridSkeleton } from "@/components/common/skeletons";
import { useClusterOverview } from "@/features/admin/hooks/use-cluster-overview";
import { formatBytes, formatDate, formatDateTime, formatDistanceToNow } from "@/lib/format";

function statusBadge(ok: boolean, okLabel: string, badLabel: string) {
  return <Badge variant={ok ? "success" : "destructive"}>{ok ? okLabel : badLabel}</Badge>;
}

export default function AdminInfrastructurePage() {
  const { data, isLoading } = useClusterOverview();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Infrastructure</h1>
          <p className="text-sm text-muted-foreground">
            Cluster, queue, cache, storage, database, backups, plugins, and licensing — deployment-wide, not
            scoped to one workspace.
          </p>
        </div>
        {data && (
          <div className="flex items-center gap-2">
            <Badge variant={data.edition === "enterprise" ? "default" : "secondary"} className="capitalize">
              {data.edition}
            </Badge>
            <Badge variant="outline">v{data.version.current}</Badge>
            {statusBadge(data.health.live, "Live", "Down")}
            {statusBadge(data.health.ready, "Ready", "Not ready")}
          </div>
        )}
      </div>

      {isLoading || !data ? (
        <CardGridSkeleton count={6} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Workers online"
              value={`${data.workerNodes.online}/${data.workerNodes.total}`}
              icon={Server}
            />
            <StatCard label="Jobs queued/running" value={`${data.distributedJobs.queued}/${data.distributedJobs.running}`} icon={Layers} />
            <StatCard label="Failed jobs (24h)" value={data.distributedJobs.failed24h} icon={Zap} />
            <StatCard label="Plugins enabled" value={`${data.plugins.enabled}/${data.plugins.installed}`} icon={Puzzle} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Boxes className="size-4" /> Cluster
                </CardTitle>
                <CardDescription>Instance ID: {data.instanceId}</CardDescription>
              </CardHeader>
              <CardContent>
                {data.leases.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No active leader-election leases.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lease</TableHead>
                        <TableHead>Holder</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.leases.map((lease) => (
                        <TableRow key={lease.name}>
                          <TableCell className="font-medium">{lease.name}</TableCell>
                          <TableCell className="max-w-40 truncate font-mono text-xs">{lease.holderId}</TableCell>
                          <TableCell>{formatDistanceToNow(lease.expiresAt)}</TableCell>
                          <TableCell>{statusBadge(!lease.expired, "Held", "Expired")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Zap className="size-4" /> Queue
                </CardTitle>
                <CardDescription className="capitalize">
                  {data.queue.provider} · {statusBadge(data.queue.connected, "Connected", "Unreachable")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.queue.queues.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No named queues with pending work.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Queue</TableHead>
                        <TableHead>Pending</TableHead>
                        <TableHead>Delayed</TableHead>
                        <TableHead>Dead-lettered</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.queue.queues.map((q) => (
                        <TableRow key={q.name}>
                          <TableCell className="font-medium">{q.name}</TableCell>
                          <TableCell>{q.pending}</TableCell>
                          <TableCell>{q.delayed}</TableCell>
                          <TableCell>{q.deadLettered}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Database className="size-4" /> Database & cache
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pool max</span>
                  <span>{data.database.poolMax}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Read replica</span>
                  <span>{data.database.readReplicaConfigured ? "Configured" : "None"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Migrations applied</span>
                  <span>{data.database.migrationsApplied}</span>
                </div>
                <div className="my-1 border-t border-border" />
                <div className="flex justify-between">
                  <span className="text-muted-foreground capitalize">Cache ({data.cache.provider})</span>
                  <span>{statusBadge(data.cache.connected, "Connected", "Unreachable")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Entries</span>
                  <span>{data.cache.entryCount ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Hit rate</span>
                  <span>{data.cache.hitRate !== null ? `${(data.cache.hitRate * 100).toFixed(1)}%` : "—"}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <HardDrive className="size-4" /> Storage & backups
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground capitalize">Storage ({data.storage.provider})</span>
                  <span>{data.storage.bucket ?? "local disk"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Used</span>
                  <span>{data.storage.totalBytes !== null ? formatBytes(data.storage.totalBytes) : "—"}</span>
                </div>
                <div className="my-1 border-t border-border" />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last backup</span>
                  <span>{data.backups.lastRunAt ? formatDateTime(data.backups.lastRunAt) : "Never"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last status</span>
                  <span>{data.backups.lastRunStatus ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Policies configured</span>
                  <span>{data.backups.policiesConfigured}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <KeyRound className="size-4" /> Licensing
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                {data.activeLicense ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Issued to</span>
                      <span>{data.activeLicense.issuedTo}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <Badge variant={data.activeLicense.status === "ACTIVE" ? "success" : "destructive"}>
                        {data.activeLicense.status}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Seats</span>
                      <span>{data.activeLicense.seats ?? "Unlimited"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Expires</span>
                      <span>{data.activeLicense.expiresAt ? formatDate(data.activeLicense.expiresAt) : "Never"}</span>
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    No active license — running on {data.edition === "enterprise" ? "trusted-environment" : "Community"}{" "}
                    mode.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="size-4" /> Health
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Liveness</span>
                  {statusBadge(data.health.live, "OK", "Down")}
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Readiness (DB reachable)</span>
                  {statusBadge(data.health.ready, "OK", "Unreachable")}
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Unhealthy workers</span>
                  <span>{data.workerNodes.unhealthy}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
