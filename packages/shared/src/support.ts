// Module 15 — Support system (task #355).

export type SupportTicketCategory = "BUG" | "BILLING" | "ACCOUNT" | "FEATURE_REQUEST" | "OTHER";
export type SupportTicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

/// Mirrors `useDiagnostics()`'s `DiagnosticsReport` shape closely enough
/// to be attached wholesale — kept as an untyped-ish bag here rather than
/// importing the frontend hook's type (this package has no dependency on
/// `apps/web`) since only the backend's storage/display needs a shape at
/// all; it's opaque `Json` in the database.
export interface SupportTicketDiagnosticsSnapshot {
  generatedAt: string;
  appVersion: string;
  serverVersion: string;
  roundTripMs: number;
  serverStatus: "ok" | "degraded";
  databaseStatus: "ok" | "failed";
  userAgent: string;
}

export interface SupportTicketDto {
  id: string;
  category: SupportTicketCategory;
  subject: string;
  message: string;
  status: SupportTicketStatus;
  email: string;
  diagnosticsSnapshot: SupportTicketDiagnosticsSnapshot | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSupportTicketRequestDto {
  category: SupportTicketCategory;
  subject: string;
  message: string;
  /// Required even for an authenticated submitter — see
  /// `SupportTicket.email`'s schema doc comment for why.
  email: string;
  diagnosticsSnapshot?: SupportTicketDiagnosticsSnapshot;
}
