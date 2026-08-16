"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useRewardAnalytics } from "@/features/bugbounty/hooks/use-submissions";

function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

/// Module 16 — task #385. Renders SubmissionAnalyticsDto: Total/Monthly/
/// Yearly Rewards, Accepted Findings, Duplicate Rate, Average Time to
/// Response, Average Time to Resolution — the exact metric set the spec
/// names. See GetRewardAnalyticsHandler's doc comment for the two
/// disclosed simplifications (dominant-currency rollup, updatedAt as a
/// resolvedAt proxy) that this page inherits.
export default function RewardsPage() {
  const { data, isLoading } = useRewardAnalytics();

  if (isLoading || !data) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rewards</h1>
        <p className="text-sm text-muted-foreground">
          Reward tracking and submission outcome analytics for this workspace.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total rewards (all time)" value={`${data.rewards.allTimeNet.toLocaleString()} ${data.rewards.currency}`} />
        <StatCard label="Total submissions" value={data.totalSubmissions} />
        <StatCard label="Accepted findings" value={data.acceptedFindings} />
        <StatCard
          label="Duplicate rate"
          value={data.duplicateRatePercent != null ? `${data.duplicateRatePercent.toFixed(1)}%` : "—"}
        />
        <StatCard
          label="Avg. time to response"
          value={data.averageTimeToResponseHours != null ? `${data.averageTimeToResponseHours.toFixed(1)}h` : "—"}
        />
        <StatCard
          label="Avg. time to resolution"
          value={data.averageTimeToResolutionHours != null ? `${data.averageTimeToResolutionHours.toFixed(1)}h` : "—"}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly rewards</CardTitle>
          </CardHeader>
          <CardContent>
            {data.rewards.monthly.length === 0 ? (
              <p className="text-sm text-muted-foreground">No reward entries yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {data.rewards.monthly.map((m) => (
                  <li key={m.period} className="flex justify-between">
                    <span className="text-muted-foreground">{m.period}</span>
                    <span className="font-medium">
                      {m.totalNet.toLocaleString()} {data.rewards.currency}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Yearly rewards</CardTitle>
          </CardHeader>
          <CardContent>
            {data.rewards.yearly.length === 0 ? (
              <p className="text-sm text-muted-foreground">No reward entries yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {data.rewards.yearly.map((y) => (
                  <li key={y.period} className="flex justify-between">
                    <span className="text-muted-foreground">{y.period}</span>
                    <span className="font-medium">
                      {y.totalNet.toLocaleString()} {data.rewards.currency}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
