import type { ReconTool } from "./recon.js";

/// Per-target authorization attestation. Legal responsibility arises at
/// scan time, so before any ACTIVE scan the API requires a valid,
/// unexpired attestation of how the user is authorized to test the target.

/// How the user is authorized to test a target.
///  - OWNER: the user (or their organization) owns the asset.
///  - WRITTEN_PERMISSION: client contract / signed Rules of Engagement.
///  - BUG_BOUNTY_SCOPE: the asset is in scope for a bug bounty program.
///
/// Phase 2 (not built): domain ownership verification via a DNS TXT record
/// `pentesthub-verify=<token>` or `/.well-known/pentesthub-verify.txt`.
/// It would be stored as its own record type (verification method, token,
/// verifiedAt) next to these attestations; verified targets would get the
/// strongest status and unverified ones could be limited to passive recon.
export const TARGET_AUTHORIZATION_BASES = ["OWNER", "WRITTEN_PERMISSION", "BUG_BOUNTY_SCOPE"] as const;
export type TargetAuthorizationBasis = (typeof TARGET_AUTHORIZATION_BASES)[number];

/// Version of the attestation wording below; stored with every attestation
/// so it is always provable which text the user confirmed.
export const TARGET_ATTESTATION_VERSION = "2026-10-06";

export const TARGET_ATTESTATION_TEXT =
  "I own this asset or have current written authorization to test it, and I will stay inside the authorized scope.";

/// Default validity of an attestation when the user sets no expiry.
export const DEFAULT_TARGET_AUTHORIZATION_MONTHS = 12;

/// Recon tools that only query public third-party sources (certificate
/// transparency, web archives, passive DNS datasets, WHOIS/ASN registries,
/// public resolvers) and send no traffic to the target's own services. Jobs
/// made only of these tools need the target to be in scope, but not an
/// authorization attestation. Every other recon tool and every
/// vulnerability scanner is ACTIVE.
export const PASSIVE_RECON_TOOLS: readonly ReconTool[] = [
  "SUBFINDER",
  "ASSETFINDER",
  "AMASS",
  "GAU",
  "WAYBACKURLS",
  "DNSX",
  "WHOIS",
  "ASN",
];

export function isPassiveReconTool(tool: ReconTool): boolean {
  return PASSIVE_RECON_TOOLS.includes(tool);
}

export interface TargetAuthorizationDto {
  id: string;
  targetId: string | null;
  programId: string | null;
  basis: TargetAuthorizationBasis;
  documentReference: string | null;
  notes: string | null;
  attestationVersion: string;
  expiresAt: string;
  createdAt: string;
  createdBy: string;
}

export interface TargetAuthorizationStatusDto {
  /// True when an active scan may start (valid attestation found).
  authorized: boolean;
  /// The attestation that authorizes the target, if any.
  current: TargetAuthorizationDto | null;
  /// Why it is not authorized, when `authorized` is false.
  reason: "MISSING" | "EXPIRED" | null;
}

/// Body for attesting a target (on create, or later to renew).
export interface AttestTargetAuthorizationRequestDto {
  basis: TargetAuthorizationBasis;
  /// Must be true — the explicit checkbox.
  attested: boolean;
  /// Contract number, ROE reference, program URL, … (optional).
  documentReference?: string;
  notes?: string;
  /// ISO date; defaults to now + DEFAULT_TARGET_AUTHORIZATION_MONTHS.
  expiresAt?: string;
}

export const targetAuthorizationEndpoints = {
  status: (targetId: string) => `/targets/${targetId}/authorization`,
  attest: (targetId: string) => `/targets/${targetId}/authorization`,
} as const;

/// Ownership verification: the user proves control of the asset before any
/// ACTIVE scan. Passive recon does not need it. Unverified targets are limited
/// to passive checks.
export type TargetOwnershipMethodName = "DNS_TXT" | "HTTP_FILE" | "META_TAG";

export interface TargetOwnershipChallengeDto {
  /// TXT record name to create: `_secora-verify.<host>`.
  dnsRecordName: string;
  /// TXT record value to create: `secora-verify=<token>`.
  dnsRecordValue: string;
  /// File to publish, with the token as its whole content.
  httpUrl: string;
  /// Meta tag to put on the home page, with the token as its content.
  metaTag: string;
}

export interface TargetOwnershipStatusDto {
  verified: boolean;
  method: TargetOwnershipMethodName | null;
  verifiedAt: string | null;
  lastCheckedAt: string | null;
  /// Why the last check failed (plain English code, never raw output).
  lastError: "DNS_RECORD_NOT_FOUND" | "HTTP_FILE_NOT_FOUND" | "META_TAG_NOT_FOUND" | "NETWORK_BLOCKED" | "UNREACHABLE" | null;
  /// Present while the target is not verified.
  challenge: TargetOwnershipChallengeDto | null;
}

export const TARGET_OWNERSHIP_ENDPOINTS = {
  status: (targetId: string) => `/targets/${targetId}/ownership`,
  challenge: (targetId: string) => `/targets/${targetId}/ownership/challenge`,
  verify: (targetId: string) => `/targets/${targetId}/ownership/verify`,
} as const;
