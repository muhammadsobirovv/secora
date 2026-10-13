/// Single source of truth for the version of the combined legal documents
/// (Terms of Service + Acceptable Use Policy + Privacy Policy). The web
/// legal pages print it, signup sends it, and the API compares every
/// user's latest accepted version against it.
///
/// Bumping LEGAL_VERSION forces every user to review and re-accept the
/// documents at their next request (the API answers 403
/// LEGAL_ACCEPTANCE_REQUIRED until they do). Bump it only for a material
/// change, and update LEGAL_EFFECTIVE_DATE together with it.
export const LEGAL_VERSION = "2026-10-13";

/// ISO date (YYYY-MM-DD) the current LEGAL_VERSION takes effect.
export const LEGAL_EFFECTIVE_DATE = "2026-10-13";

export const LEGAL_DOCUMENTS = ["terms", "aup", "privacy"] as const;
export type LegalDocumentKind = (typeof LEGAL_DOCUMENTS)[number];

export const LEGAL_ACCEPTANCE_REQUIRED = "LEGAL_ACCEPTANCE_REQUIRED";

export const LEGAL_CONTACT = {
  support: "support@secora.group",
  security: "security@secora.group",
} as const;

export interface LegalStatusDto {
  currentVersion: string;
  effectiveDate: string;
  /// Latest version this user has accepted, or null if never.
  acceptedVersion: string | null;
  acceptanceRequired: boolean;
}

export interface AcceptLegalRequestDto {
  /// Must equal LEGAL_VERSION — accepting a stale version is rejected so
  /// a user can never "accept" text they were not shown.
  version: string;
}

export const LEGAL_ENDPOINTS = {
  status: "/legal/status",
  accept: "/legal/accept",
} as const;
