import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  BugBountyFindingStage,
  BugBountyProgramStatus,
  BugReportStatus,
  ScopeClassification,
} from "@pentesthub/shared";

/// Module 19 baseline audit fix: `BugBountyFindingStage` gained `DRAFT`/
/// `INFORMATIVE`/`ACCEPTED`/`REJECTED` (Module 16 — task #382, "Finding
/// validation workflow states") but this component was never updated to
/// match — `apps/web`'s typecheck was failing on this file (TS2739,
/// "missing the following properties") before this fix, unrelated to any
/// Module 19 change. Found via a `tsc --noEmit` run during the Module 19
/// baseline audit's verification pass.
const STAGE_CLASS: Record<BugBountyFindingStage, string> = {
  DRAFT: "border-border text-muted-foreground",
  NEW: "border-border text-muted-foreground",
  TRIAGED: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  VERIFIED: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  REPORTED: "border-warning/30 bg-warning/10 text-warning-foreground dark:text-warning",
  DUPLICATE: "border-border bg-muted text-muted-foreground",
  INFORMATIVE: "border-border bg-muted text-muted-foreground",
  ACCEPTED: "border-success/30 bg-success/10 text-success dark:text-success",
  NEED_MORE_INFO: "border-warning/30 bg-warning/10 text-warning-foreground dark:text-warning",
  REJECTED: "border-destructive/30 bg-destructive/10 text-destructive",
  RESOLVED: "border-success/30 bg-success/10 text-success dark:text-success",
  CLOSED: "border-border text-muted-foreground",
  ARCHIVED: "border-border text-muted-foreground",
  // Module 16 -- task #382 Finding Validation Workflow States (see
  // BugBountyFindingStage's doc comment in packages/shared/src/bugbounty.ts).
  FALSE_POSITIVE: "border-border bg-muted text-muted-foreground",
  ACCEPTED_RISK: "border-warning/30 bg-warning/10 text-warning-foreground dark:text-warning",
  REMEDIATED: "border-success/30 bg-success/10 text-success dark:text-success",
  REOPENED: "border-destructive/30 bg-destructive/10 text-destructive",
};

const STAGE_LABEL: Record<BugBountyFindingStage, string> = {
  DRAFT: "Draft",
  NEW: "New",
  TRIAGED: "Triaged",
  VERIFIED: "Verified",
  REPORTED: "Reported",
  DUPLICATE: "Duplicate",
  INFORMATIVE: "Informative",
  ACCEPTED: "Accepted",
  NEED_MORE_INFO: "Need more info",
  REJECTED: "Rejected",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  ARCHIVED: "Archived",
  FALSE_POSITIVE: "False positive",
  ACCEPTED_RISK: "Accepted risk",
  REMEDIATED: "Remediated",
  REOPENED: "Reopened",
};

export function BugBountyFindingStageBadge({ stage, className }: { stage: BugBountyFindingStage; className?: string }) {
  return (
    <Badge variant="outline" className={cn(STAGE_CLASS[stage], className)}>
      {STAGE_LABEL[stage]}
    </Badge>
  );
}

const REPORT_STATUS_CLASS: Record<BugReportStatus, string> = {
  DRAFT: "border-border text-muted-foreground",
  SUBMITTED: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  TRIAGED: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  ACCEPTED: "border-success/30 bg-success/10 text-success dark:text-success",
  REJECTED: "border-destructive/30 bg-destructive/10 text-destructive",
  DUPLICATE: "border-border bg-muted text-muted-foreground",
  RESOLVED: "border-success/30 bg-success/10 text-success dark:text-success",
  CLOSED: "border-border text-muted-foreground",
};

const REPORT_STATUS_LABEL: Record<BugReportStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  TRIAGED: "Triaged",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  DUPLICATE: "Duplicate",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export function BugReportStatusBadge({ status, className }: { status: BugReportStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn(REPORT_STATUS_CLASS[status], className)}>
      {REPORT_STATUS_LABEL[status]}
    </Badge>
  );
}

const PROGRAM_STATUS_CLASS: Record<BugBountyProgramStatus, string> = {
  ACTIVE: "border-success/30 bg-success/10 text-success dark:text-success",
  PAUSED: "border-warning/30 bg-warning/10 text-warning-foreground dark:text-warning",
  CLOSED: "border-border text-muted-foreground",
  ARCHIVED: "border-border text-muted-foreground",
};

export function BugBountyProgramStatusBadge({
  status,
  className,
}: {
  status: BugBountyProgramStatus;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(PROGRAM_STATUS_CLASS[status], className)}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  );
}

/// Module 19 baseline audit fix: same class of bug as
/// `STAGE_CLASS`/`STAGE_LABEL` above — `ScopeClassification` gained
/// `REVIEW_NEEDED`/`DEPRECATED` (Module 9) but this Record was never
/// updated.
const SCOPE_CLASS: Record<ScopeClassification, string> = {
  IN_SCOPE: "border-success/30 bg-success/10 text-success dark:text-success",
  OUT_OF_SCOPE: "border-destructive/30 bg-destructive/10 text-destructive",
  UNKNOWN: "border-border text-muted-foreground",
  REVIEW_NEEDED: "border-warning/30 bg-warning/10 text-warning-foreground dark:text-warning",
  DEPRECATED: "border-border bg-muted text-muted-foreground",
};

const SCOPE_LABEL: Record<ScopeClassification, string> = {
  IN_SCOPE: "In scope",
  OUT_OF_SCOPE: "Out of scope",
  UNKNOWN: "Unknown",
  REVIEW_NEEDED: "Review needed",
  DEPRECATED: "Deprecated",
};

export function ScopeClassificationBadge({
  classification,
  className,
}: {
  classification: ScopeClassification;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(SCOPE_CLASS[classification], className)}>
      {SCOPE_LABEL[classification]}
    </Badge>
  );
}
