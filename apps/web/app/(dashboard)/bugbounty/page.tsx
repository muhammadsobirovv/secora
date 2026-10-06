"use client";

import Link from "next/link";
import {
  Award,
  Bug,
  DollarSign,
  FileBarChart,
  FileText,
  Radar,
  ShieldQuestion,
  Target,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState } from "@/components/common/empty-state";
import { useBugBountyDashboard, useBugBountyStatistics } from "@/features/bugbounty/hooks/use-bugbounty";
import { BugBountyFindingStageBadge } from "@/features/bugbounty/components/bugbounty-badges";
import { VulnFindingSeverityBadge } from "@/features/vuln/components/vuln-finding-severity-badge";
import { PageHelp } from "@/components/common/page-help";

function formatPercent(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

/// Workspace-wide landing page for Module 6 — mirrors VulnDashboardPage's
/// "one aggregate query + quick links" shape, backed by
/// GetBugBountyDashboardQuery/GetBugBountyStatisticsQuery.
export default function BugBountyDashboardPage() {
  const { data: dashboard, isLoading } = useBugBountyDashboard();
  const { data: stats } = useBugBountyStatistics();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Bug className="size-6" /> Bug Bounty
            <PageHelp
              summary="Runs your bug bounty engagements end to end: which programs you're working, what's in scope, and how findings turn into paid reports — separate from your own internal pentest projects."
              steps={[
                "Import or add a program (HackerOne/Bugcrowd/Intigriti/Markdown/JSON) under \"Programs\" — this defines scope, policy, and reward tiers.",
                "Recon and vulnerability findings that match a program's in-scope assets get tracked as bug bounty findings here.",
                "Draft a report (AI can help write it) under \"Reports\", submit it, and track the payout.",
              ]}
              actions={[
                { label: "Programs", description: "The bug bounty programs you're enrolled in — scope, policy, safe-harbor terms, reward tiers." },
                { label: "Findings", description: "Confirmed vulnerabilities that are in-scope for a program, waiting to become a report." },
                { label: "Reports", description: "Draft, submit, and track bug reports and their payout status." },
              ]}
            />
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Programs, findings, and reports across every bug bounty engagement.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link href="/bugbounty/programs">
              <Radar className="size-4" /> Programs
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/bugbounty/findings">
              <ShieldQuestion className="size-4" /> Findings
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/bugbounty/reports">
              <FileText className="size-4" /> Reports
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Active programs" value={dashboard?.activeProgramsCount ?? 0} icon={Radar} isLoading={isLoading} />
        <StatCard label="In-scope assets" value={dashboard?.inScopeAssetsCount ?? 0} icon={Target} isLoading={isLoading} />
        <StatCard label="Pending reports" value={dashboard?.pendingReportsCount ?? 0} icon={FileText} isLoading={isLoading} />
        <StatCard
          label="Bounty earned"
          value={dashboard ? formatCurrency(dashboard.totalBountyEarned, dashboard.currency) : "—"}
          icon={DollarSign}
          isLoading={isLoading}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Success rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{stats ? formatPercent(stats.successRate) : <Skeleton className="h-8 w-16" />}</p>
            <p className="mt-1 text-xs text-muted-foreground">Accepted or resolved / decided reports</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Acceptance rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{stats ? formatPercent(stats.acceptanceRate) : <Skeleton className="h-8 w-16" />}</p>
            <p className="mt-1 text-xs text-muted-foreground">Accepted / (accepted + rejected)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Duplicate rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{stats ? formatPercent(stats.duplicateRate) : <Skeleton className="h-8 w-16" />}</p>
            <p className="mt-1 text-xs text-muted-foreground">Duplicate / decided reports</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">Recent findings</CardTitle>
          <Button size="sm" variant="outline" asChild>
            <Link href="/bugbounty/findings">View all →</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !dashboard?.recentFindings.length ? (
            <EmptyState icon={Bug} title="No findings yet" description="Findings you report will show up here." />
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {dashboard.recentFindings.map((finding) => (
                <Link
                  key={finding.id}
                  href={`/bugbounty/findings/${finding.id}`}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm hover:bg-muted/50"
                >
                  <span className="truncate font-medium">{finding.title}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <VulnFindingSeverityBadge severity={finding.severity} />
                    <BugBountyFindingStageBadge stage={finding.stage} />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Award className="size-4" /> Recent activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!dashboard?.recentActivity.length ? (
            <p className="text-sm text-muted-foreground">No recent activity.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {dashboard.recentActivity.map((event, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    <span className="font-medium text-foreground">{event.verb}</span> · {event.entityType}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(event.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" asChild>
          <Link href="/bugbounty/payloads">
            <FileBarChart className="size-4" /> Payload library
          </Link>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href="/bugbounty/knowledge-base">Knowledge base</Link>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href="/bugbounty/calendar">Calendar</Link>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href="/bugbounty/bookmarks">Bookmarks</Link>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href="/bugbounty/notifications">Notifications</Link>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href="/bugbounty/search">Search</Link>
        </Button>
      </div>
    </div>
  );
}
