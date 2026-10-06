import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface StatCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  isLoading?: boolean;
}

export function StatCard({ label, value, icon: Icon, isLoading }: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium tracking-wider text-muted-foreground uppercase">{label}</p>
          {isLoading ? (
            <Skeleton className="mt-2 h-7 w-12" />
          ) : (
            <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums">{value}</p>
          )}
        </div>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/40 bg-primary/10">
          <Icon className="size-4 text-primary" />
        </div>
      </CardContent>
    </Card>
  );
}
