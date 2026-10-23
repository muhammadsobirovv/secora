// Stage 4 — the scan report and per-finding explanations. These shapes are what
// the API returns, what the HTML/PDF/JSON exports render, and what the public
// share page receives. Nothing here carries a secret: evidence is redacted and
// size-capped on the server before it is put in these objects.

import type { OwaspCategory, VulnFindingSeverity, VulnScanProfile, VulnScanner } from "./vuln.js";
import type { PipelineStage } from "./vuln.js";

/// CONFIRMED only when a safe re-check reproduced the issue; LIKELY when a
/// tool reported it but it was not (or could not be) re-checked, or the
/// re-check did not reproduce it; INFO for informational items.
export type ReportConfidence = "CONFIRMED" | "LIKELY" | "INFO";

export type VerificationStatus = "REPRODUCED" | "NOT_REPRODUCED" | "NOT_APPLICABLE" | "FAILED";

export interface ReportVerificationDto {
  status: VerificationStatus;
  /// "exposed-file" | "missing-header" | "open-redirect" | "reflected-xss"
  method: string | null;
  checkedAt: string | null;
  detail: string | null;
}

export interface ReportEvidenceDto {
  request: string | null;
  response: string | null;
  payload: string | null;
}

export interface ReportFindingSourceDto {
  tool: VulnScanner;
  findingId: string;
  title: string;
}

export interface ReportSnippetDto {
  stack: string;
  language: string;
  code: string;
}

export interface ReportExplanationTextDto {
  whatIsThis: string;
  whyItMatters: string;
  howToFix: string;
}

export interface ReportFindingDto {
  /// Id of the primary VulnFinding the group is built around.
  id: string;
  /// Canonical issue class used for de-duplication, e.g. "header-csp-missing".
  issueKey: string;
  title: string;
  severity: VulnFindingSeverity;
  confidence: ReportConfidence;
  /// URL or host the issue is on.
  affected: string;
  host: string;
  path: string | null;
  description: string;
  /// The built-in explanation in the report's language (always present; an AI
  /// explanation replaces it only when the reader asks for one).
  builtIn: ReportExplanationTextDto;
  evidence: ReportEvidenceDto;
  /// Every tool that reported it (more than one after de-duplication).
  sources: ReportFindingSourceDto[];
  remediation: string;
  /// Ready-to-use config for the detected stack, when one exists.
  snippet: ReportSnippetDto | null;
  /// Detected technology the snippet was chosen for, e.g. "nginx".
  stack: string | null;
  cwe: string | null;
  cves: string[];
  owasp: OwaspCategory | null;
  references: string[];
  verification: ReportVerificationDto;
}

export type ReportGrade = "A" | "B" | "C" | "D" | "F";

export interface ReportStageDto {
  stage: PipelineStage;
  state: "done" | "skipped" | "failed" | "not-run";
  /// Why it was skipped or how it failed, as the worker logged it.
  note: string | null;
}

export interface ReportToolDto {
  tool: string;
  version: string;
  /// Whether the tool ran in this scan (false when its stage was skipped or never started).
  ran: boolean;
}

export type ReportNotTestedCode =
  | "STAGE_FAILED"
  | "STAGE_SKIPPED"
  | "STAGE_NOT_RUN"
  | "NO_AUTH"
  | "NO_BUSINESS_LOGIC"
  | "HOME_PAGE_ONLY"
  | "NO_TEMPLATES"
  | "NO_PORT_SCAN"
  | "NO_CONTENT_DISCOVERY"
  | "NO_XSS_TESTING"
  | "NO_STORED_XSS"
  | "HTTP_TEMPLATES_ONLY"
  | "SUBDOMAINS_NOT_COVERED";

export interface ReportNotTestedDto {
  code: ReportNotTestedCode;
  /// For STAGE_* codes: which stage.
  stage?: PipelineStage;
  /// For STAGE_* codes: why, as the worker logged it (technical English).
  detail?: string;
}

export interface VulnReportDto {
  jobId: string;
  target: { id: string; type: string; value: string };
  profile: VulnScanProfile | null;
  status: string;
  score: number;
  grade: ReportGrade;
  counts: Record<VulnFindingSeverity, number>;
  /// Counts of findings that are CONFIRMED / LIKELY / INFO.
  confidenceCounts: Record<ReportConfidence, number>;
  /// What the ownership proof let the scan touch. null = not recorded.
  scope: { root: string | null; includesSubdomains: boolean | null };
  startedAt: string | null;
  completedAt: string | null;
  generatedAt: string;
  stages: ReportStageDto[];
  tools: ReportToolDto[];
  /// What this scan did NOT test: stages that failed or were skipped, and
  /// what the profile does not cover. Codes are translated by the reader.
  notTested: ReportNotTestedDto[];
  findings: ReportFindingDto[];
  /// Language the report text was produced in ("en" | "uz" | "ru").
  language: ReportLanguage;
}

export type ReportLanguage = "en" | "uz" | "ru";

export interface FindingExplanationDto {
  findingId: string;
  language: ReportLanguage;
  /// "AI" when a model wrote it; "STATIC" for the built-in text (no provider,
  /// quota reached, or the model's answer was unusable).
  source: "AI" | "STATIC";
  cached: boolean;
  whatIsThis: string;
  whyItMatters: string;
  howToFix: string;
  snippet: ReportSnippetDto | null;
}

export interface CreateReportShareRequestDto {
  /// 1..30 days; the link stops working after that.
  expiresInDays: number;
}

export interface ReportShareDto {
  id: string;
  token: string;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  accessCount: number;
}
