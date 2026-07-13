export type ReconTool =
  | "NMAP"
  | "SUBFINDER"
  | "HTTPX"
  | "DNSX"
  | "NAABU"
  | "WHATWEB"
  | "ASSETFINDER"
  | "GOWITNESS"
  | "AMASS"
  | "KATANA"
  | "GAU"
  | "WAYBACKURLS"
  | "WHOIS"
  | "ASN";

export type ReconJobStatus =
  | "PENDING"
  | "RUNNING"
  | "RETRYING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type ReconJobLogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export type ReconFindingType =
  | "SUBDOMAIN"
  | "URL"
  | "OPEN_PORT"
  | "SERVICE"
  | "TECHNOLOGY"
  | "DNS_RECORD"
  | "HTTP_HEADER"
  | "CERTIFICATE"
  | "SCREENSHOT"
  | "SECURITY_HEADER"
  | "WHOIS_RECORD"
  | "ASN";

export interface ReconJobToolRunDto {
  id: string;
  jobId: string;
  tool: ReconTool;
  status: ReconJobStatus;
  startedAt: string | null;
  completedAt: string | null;
  exitCode: number | null;
  findingsCount: number;
  errorMessage: string | null;
}

export interface ReconJobDto {
  id: string;
  workspaceId: string;
  projectId: string;
  targetId: string;
  tools: ReconTool[];
  status: ReconJobStatus;
  retryCount: number;
  maxRetries: number;
  timeoutSeconds: number;
  requestedBy: string;
  error: string | null;
  claimedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelRequestedAt: string | null;
  createdAt: string;
  updatedAt: string;
  toolRuns: ReconJobToolRunDto[];
  findingsCount: number;
}

export interface CreateReconJobRequestDto {
  tools: ReconTool[];
}

/// `seq` is transported as a string — it's a Postgres BIGINT, which
/// doesn't round-trip safely through JSON's number type.
export interface ReconJobLogDto {
  id: string;
  seq: string;
  jobId: string;
  toolRunId: string | null;
  level: ReconJobLogLevel;
  message: string;
  createdAt: string;
}

export interface ReconFindingDto {
  id: string;
  jobId: string;
  workspaceId: string;
  projectId: string;
  targetId: string;
  type: ReconFindingType;
  value: string;
  data: Record<string, unknown>;
  source: ReconTool;
  dedupKey: string;
  firstSeenAt: string;
  lastSeenAt: string;
  promotedTargetId: string | null;
  createdAt: string;
}

export interface ListReconJobsQueryDto {
  projectId?: string;
  targetId?: string;
  status?: ReconJobStatus;
  limit?: number;
}

export interface ListReconFindingsQueryDto {
  targetId?: string;
  projectId?: string;
  jobId?: string;
  type?: ReconFindingType;
}

export interface PromoteFindingRequestDto {
  scopeStatus?: "IN_SCOPE" | "OUT_OF_SCOPE" | "PENDING_REVIEW";
  name?: string;
}

/// Which Target types each tool makes sense against — shared by the
/// frontend (graying out invalid checkboxes) and the backend (rejecting
/// a nonsensical tool/target pairing server-side, since client-side
/// validation is never sufficient on its own).
export const TOOL_TARGET_TYPE_COMPATIBILITY: Record<ReconTool, string[]> = {
  SUBFINDER: ["DOMAIN"],
  ASSETFINDER: ["DOMAIN"],
  DNSX: ["DOMAIN", "SUBDOMAIN"],
  NAABU: ["IP_ADDRESS", "CIDR", "DOMAIN", "SUBDOMAIN"],
  NMAP: ["IP_ADDRESS", "CIDR", "DOMAIN", "SUBDOMAIN"],
  HTTPX: ["URL", "DOMAIN", "SUBDOMAIN"],
  WHATWEB: ["URL", "DOMAIN", "SUBDOMAIN"],
  GOWITNESS: ["URL", "DOMAIN", "SUBDOMAIN"],
  AMASS: ["DOMAIN"],
  KATANA: ["URL", "DOMAIN", "SUBDOMAIN"],
  GAU: ["DOMAIN", "SUBDOMAIN"],
  WAYBACKURLS: ["DOMAIN", "SUBDOMAIN"],
  WHOIS: ["DOMAIN"],
  ASN: ["IP_ADDRESS"],
};

/// Only these finding types map to a real Target type — the rest (ports,
/// services, technologies, headers, certificates) describe something
/// *about* a target, not a new addressable target themselves, so they're
/// not promotable.
export const FINDING_TYPE_TO_TARGET_TYPE: Partial<Record<ReconFindingType, string>> = {
  SUBDOMAIN: "SUBDOMAIN",
  URL: "URL",
};
