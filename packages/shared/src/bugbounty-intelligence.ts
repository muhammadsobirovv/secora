// Module 16 — Recon Intelligence, Technology fingerprinting, Asset Graph,
// Change Detection, Finding Correlation, CVE Intelligence, Vulnerability
// Matching, Risk Engine (tasks #372-380, #394-395).

export interface TechnologyDto {
  id: string;
  targetId: string;
  name: string;
  category: string | null;
  version: string | null;
  detectedVia: string;
  confidence: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

// Extended in Module 17 (task #462) with CIDR, API, SERVICE, MOBILE_APP,
// HOST, CONTAINER, KUBERNETES_RESOURCE to cover the full Security Asset
// Inventory type set. Extends the existing enum rather than introducing a
// parallel "SecurityAsset" type — see apps/api prisma schema.prisma
// AssetGraphNodeType doc-comment for the matching Prisma-side extension.
export type AssetGraphNodeType =
  | "DOMAIN" | "SUBDOMAIN" | "IP" | "PORT" | "URL" | "ENDPOINT"
  | "TECHNOLOGY" | "CERTIFICATE" | "ASN" | "CLOUD_ASSET" | "REPOSITORY" | "FINDING"
  | "CIDR" | "API" | "SERVICE" | "MOBILE_APP" | "HOST" | "CONTAINER" | "KUBERNETES_RESOURCE";

export type AssetGraphEdgeType =
  | "RESOLVES_TO" | "CONTAINS" | "HOSTS" | "USES" | "REDIRECTS_TO"
  | "BELONGS_TO" | "DISCOVERED_BY" | "AFFECTED_BY";

export interface AssetGraphNodeDto {
  id: string;
  nodeType: AssetGraphNodeType;
  refId: string;
  label: string;
  metadata: Record<string, unknown> | null;
}

export interface AssetGraphEdgeDto {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  edgeType: AssetGraphEdgeType;
  metadata: Record<string, unknown> | null;
}

export interface AssetGraphDto {
  targetId: string;
  nodes: AssetGraphNodeDto[];
  edges: AssetGraphEdgeDto[];
  generatedAt: string;
}

export interface AttackSurfaceSummaryDto {
  totalAssets: number;
  liveHosts: number;
  openPorts: number;
  httpServices: number;
  endpoints: number;
  technologies: number;
  potentialFindings: number;
  highRiskAssets: number;
  newAssets7d: number;
  removedAssets7d: number;
}

export type ChangeDetectionEventType =
  | "NEW_SUBDOMAIN" | "REMOVED_SUBDOMAIN" | "NEW_PORT" | "CLOSED_PORT" | "NEW_ENDPOINT"
  | "CHANGED_TECHNOLOGY" | "CHANGED_HTTP_HEADERS" | "CHANGED_TLS_CERTIFICATE" | "CHANGED_DNS" | "CHANGED_SCOPE";

export interface ChangeDetectionEventDto {
  id: string;
  targetId: string;
  reconJobId: string | null;
  changeType: ChangeDetectionEventType;
  entityRef: string;
  previousValue: unknown;
  newValue: unknown;
  detectedAt: string;
}

export type CorrelationInsightKind =
  | "OPEN_PORT_EXPOSED_SERVICE" | "OUTDATED_TECH_KNOWN_CVE" | "SUBDOMAIN_TAKEOVER_DANGLING_DNS"
  | "MISSING_HEADER_SENSITIVE_ENDPOINT" | "AUTH_WEAKNESS_SENSITIVE_API"
  // Module 17 — Change Intelligence (task #464): fired only for facts that
  // are new since the previous scan (see FindingCorrelationService).
  | "NEW_ASSET_POTENTIAL_EXPOSURE" | "NEW_SERVICE_POTENTIAL_EXPOSURE";

export interface CorrelationInsightDto {
  id: string;
  targetId: string | null;
  kind: CorrelationInsightKind;
  title: string;
  description: string;
  severity: string | null;
  relatedRefs: unknown;
  createdAt: string;
}

// --- CVE Intelligence -------------------------------------------------------

/// `none` is the default — a Community Edition deployment never contacts
/// any external intelligence source unless an operator explicitly
/// configures one. Each named provider is a free, publicly-documented
/// feed (NVD/CISA KEV/OSV/GitHub Advisories); none require a paid API key.
export type CveIntelligenceProvider = "none" | "nvd" | "cisa_kev" | "osv" | "github_advisories" | "vendor" | "manual";

export interface CveRecordDto {
  cveId: string;
  cvssScore: number | null;
  cvssVector: string | null;
  cwe: string | null;
  cpeList: string[] | null;
  epss: number | null;
  description: string | null;
  references: string[] | null;
  publishedAt: string | null;
  source: string;
  cachedAt: string;
}

export interface CveMatchDto {
  id: string;
  targetId: string | null;
  technologyId: string | null;
  findingId: string | null;
  cveId: string;
  confidence: number;
  evidence: unknown;
  createdAt: string;
  cve: CveRecordDto;
}

// --- Risk Engine -------------------------------------------------------------

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface RiskScoreInputsDto {
  severity: string;
  cvssScore: number | null;
  epss: number | null;
  assetCriticality: number | null;
  internetExposure: boolean | null;
  confidence: number | null;
  exploitability: string | null;
  businessImpact: string | null;
  historicalActivityScore: number | null;
}

export interface RiskScoreResultDto {
  riskScore: number;
  riskLevel: RiskLevel;
  inputs: RiskScoreInputsDto;
}
