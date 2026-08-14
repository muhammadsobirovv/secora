/// Module 15 — task #343 "GDPR-ready foundation". This is deliberately a
/// static, read-only reference surface rather than new stateful GDPR
/// machinery: the actual technical capability already exists split across
/// two places —
///  - org-level, admin-triggered exports/retention: Module 10's Compliance
///    module (`ComplianceExportRequest`, `DataRetentionPolicy` — see
///    compliance.ts / compliance-endpoints.ts)
///  - per-account, self-service export/erasure: Module 15 task #342
///    (`GET /auth/privacy/data-export`, `POST /auth/privacy/delete-account`)
/// This file's job is to give operators and data subjects a single,
/// coherent "what does this platform do with my data, and how do I
/// exercise my rights" answer that ties those two together, plus a data
/// processing register (GDPR Art. 30-style) for operators who need one for
/// their own compliance documentation. See docs/compliance/gdpr-readiness.md
/// for the full narrative this API backs.

export type GdprLawfulBasis =
  | "CONSENT"
  | "CONTRACT"
  | "LEGAL_OBLIGATION"
  | "LEGITIMATE_INTERESTS";

export interface DataProcessingRegisterEntry {
  category: string;
  examples: string[];
  purpose: string;
  lawfulBasis: GdprLawfulBasis;
  retention: string;
  storageLocation: string;
}

export const DATA_PROCESSING_REGISTER: DataProcessingRegisterEntry[] = [
  {
    category: "Account & authentication",
    examples: ["email", "password hash", "MFA factors", "session/device metadata"],
    purpose: "Account creation, authentication, and session security",
    lawfulBasis: "CONTRACT",
    retention: "Until account deletion — see the self-service /auth/privacy/delete-account endpoint",
    storageLocation: "Primary database, within the operator's chosen deployment region",
  },
  {
    category: "Security & audit events",
    examples: ["login/logout events", "IP address", "user agent", "MFA challenge events"],
    purpose: "Security monitoring, abuse prevention, and incident investigation",
    lawfulBasis: "LEGITIMATE_INTERESTS",
    retention: "Per-organization DataRetentionPolicy where configured; unbounded otherwise (operator-controlled)",
    storageLocation: "Primary database",
  },
  {
    category: "Billing & usage",
    examples: ["subscription plan", "invoices", "usage counters", "payment provider customer id"],
    purpose: "Subscription billing and quota enforcement",
    lawfulBasis: "CONTRACT",
    retention: "Per the operator's applicable tax/accounting record-keeping obligations",
    storageLocation: "Primary database, plus whichever payment provider the operator has configured (e.g. Stripe)",
  },
  {
    category: "AI conversations",
    examples: ["chat messages", "AI-generated findings and report drafts"],
    purpose: "Delivering the AI security copilot feature",
    lawfulBasis: "CONTRACT",
    retention: "Workspace-scoped, until deleted by the workspace owner or account owner",
    storageLocation:
      "Primary database when the workspace AI privacy mode is CLOUD/HYBRID; stays entirely on-device when set to LOCAL — see the AI privacy mode settings",
  },
  {
    category: "Workspace content",
    examples: ["findings", "reports", "recon/vulnerability scan results", "attachments and evidence files"],
    purpose: "Delivering the core pentesting and bug-bounty platform functionality",
    lawfulBasis: "CONTRACT",
    retention: "Workspace-scoped, per the organization's configured DataRetentionPolicy",
    storageLocation: "Primary database plus the operator's configured object storage (local disk or S3-compatible)",
  },
  {
    category: "Telemetry (optional)",
    examples: ["feature usage counts", "error diagnostics"],
    purpose: "Product improvement — only collected when not opted out",
    lawfulBasis: "CONSENT",
    retention: "Aggregated where possible; disabled entirely by self-hosted operators who turn telemetry off",
    storageLocation: "Operator-configured telemetry endpoint; self-hosted deployments may disable it entirely",
  },
];

export interface DataSubjectRight {
  right: string;
  gdprArticle: string;
  howToExercise: string;
}

export const DATA_SUBJECT_RIGHTS: DataSubjectRight[] = [
  {
    right: "Right to access",
    gdprArticle: "Article 15",
    howToExercise:
      "GET /auth/privacy/data-export for your own account, or an organization Admin can request an org-wide export via POST /enterprise/organizations/:id/compliance/exports",
  },
  {
    right: 'Right to erasure ("right to be forgotten")',
    gdprArticle: "Article 17",
    howToExercise:
      "POST /auth/privacy/delete-account — see that endpoint's documentation for the exact scope of what is and isn't erased",
  },
  {
    right: "Right to data portability",
    gdprArticle: "Article 20",
    howToExercise: "GET /auth/privacy/data-export returns a structured, machine-readable JSON export",
  },
  {
    right: "Right to rectification",
    gdprArticle: "Article 16",
    howToExercise: "Update account/profile details directly in account settings",
  },
  {
    right: "Right to restrict processing / right to object",
    gdprArticle: "Articles 18 & 21",
    howToExercise:
      "Not currently a self-service action — contact the workspace or organization owner, or the platform operator, per the manual procedure in docs/compliance/gdpr-readiness.md",
  },
  {
    right: "Right to withdraw consent (telemetry)",
    gdprArticle: "Article 7",
    howToExercise: "PATCH /users/me/preferences with { telemetryOptOut: true }",
  },
];

export interface GdprOverviewDto {
  dataProcessingRegister: DataProcessingRegisterEntry[];
  dataSubjectRights: DataSubjectRight[];
  breachNotificationProcedure: string;
  crossBorderTransfers: string;
}
