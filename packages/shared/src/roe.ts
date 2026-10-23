// Client engagement ("rules of engagement") authorizations: written
// authorization plus approval by the client's own mailbox. See
// docs/operations/authorization-model.md for what this does and does not prove.

export type RoeStatus = "PENDING" | "ACTIVE" | "DECLINED" | "EXPIRED" | "REVOKED" | "CANCELLED";

/// IP addresses and CIDR ranges are not supported by ROE v1.
export type RoeAssetType = "DOMAIN" | "SUBDOMAIN" | "URL";
export const ROE_ASSET_TYPES: readonly RoeAssetType[] = ["DOMAIN", "SUBDOMAIN", "URL"];

export const ROE_LIMITS = {
  maxAssets: 20,
  maxWindowDays: 90,
  maxPendingPerUser: 5,
  maxEmailsPerUserPerHour: 10,
  maxEmailsPerRecipientPerDay: 3,
  resendCooldownMinutes: 10,
  tokenTtlDays: 7,
  evidenceMaxBytes: 10 * 1024 * 1024,
  clientNameMax: 120,
  personNameMax: 120,
  roleMax: 120,
} as const;

export interface RoeAssetInputDto {
  type: RoeAssetType;
  value: string;
  /// Also covers every subdomain of the asset. Default off.
  wildcard?: boolean;
}

export interface CreateRoeRequestDto {
  clientName: string;
  clientEmail: string;
  assets: RoeAssetInputDto[];
  /// ISO timestamps.
  windowStart: string;
  windowEnd: string;
  signatoryName: string;
  signatoryRole: string;
  /// The requester takes responsibility for the authorization being genuine.
  responsibilityAccepted: boolean;
}

export interface RoeAssetDto {
  id: string;
  type: RoeAssetType;
  value: string;
  host: string;
  wildcard: boolean;
}

export interface RoeAuthorizationDto {
  id: string;
  /// Effective status: an ACTIVE authorization past its window reads EXPIRED,
  /// a PENDING one whose link ran out reads EXPIRED.
  status: RoeStatus;
  clientName: string;
  clientEmail: string;
  assets: RoeAssetDto[];
  windowStart: string;
  windowEnd: string;
  signatoryName: string;
  signatoryRole: string;
  hasEvidence: boolean;
  evidenceName: string | null;
  evidenceSize: number | null;
  createdAt: string;
  approvedAt: string | null;
  /// When the approval link stops working (PENDING only).
  tokenExpiresAt: string | null;
  lastEmailAt: string | null;
  /// Earliest time the approval email may be sent again (PENDING only).
  canResendAt: string | null;
}

/// What the client sees on the public approval or revoke page.
export interface RoePublicRequestDto {
  kind: "APPROVAL" | "REVOKE";
  requesterName: string;
  requesterEmail: string;
  clientName: string;
  assets: Pick<RoeAssetDto, "type" | "value" | "wildcard">[];
  windowStart: string;
  windowEnd: string;
  signatoryName: string;
  signatoryRole: string;
}

export type RoePublicOutcome = "APPROVED" | "DECLINED" | "REVOKED";

/// The authorization a report was produced under.
export interface ReportAuthorizationDto {
  kind: "OWNERSHIP" | "ROE";
  /// ROE only.
  clientName?: string;
  windowStart?: string;
  windowEnd?: string;
  approvedAt?: string;
  /// The mailbox that approved. Masked on shared (public) reports.
  approvedBy?: string;
}
