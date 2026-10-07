import type { AttestTargetAuthorizationRequestDto } from "./target-authorization.js";
import type { TagDto } from "./tags.js";

export type TargetType =
  | "DOMAIN"
  | "SUBDOMAIN"
  | "URL"
  | "IP_ADDRESS"
  | "CIDR"
  | "API"
  | "MOBILE_APP"
  | "INTERNAL_ASSET";

// Module 17 -- Security Asset Ownership (task #3) adds a dedicated TEST
// value distinct from DEVELOPMENT; additive, no existing value's meaning
// changes -- see prisma/schema.prisma's TargetEnvironment enum comment.
export type TargetEnvironment = "PRODUCTION" | "STAGING" | "DEVELOPMENT" | "TEST" | "UNKNOWN";
export type TargetScopeStatus = "IN_SCOPE" | "OUT_OF_SCOPE" | "PENDING_REVIEW";

export interface TargetDto {
  id: string;
  projectId: string;
  type: TargetType;
  value: string;
  name: string | null;
  description: string | null;
  environment: TargetEnvironment;
  scopeStatus: TargetScopeStatus;
  customFields: Record<string, unknown> | null;
  createdBy: string;
  tags: TagDto[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTargetRequestDto {
  type: TargetType;
  value: string;
  name?: string;
  description?: string;
  environment?: TargetEnvironment;
  scopeStatus?: TargetScopeStatus;
  /// How the user is authorized to test this target. Optional on the API
  /// (targets also come from finding promotion, imports and integrations);
  /// the web form always sends it. Active scans are refused until the
  /// target has a valid attestation, however it was created.
  authorization?: AttestTargetAuthorizationRequestDto;
}

export interface UpdateTargetRequestDto {
  value?: string;
  name?: string;
  description?: string;
  environment?: TargetEnvironment;
  scopeStatus?: TargetScopeStatus;
}

export interface ListTargetsQueryDto {
  type?: TargetType;
  scopeStatus?: TargetScopeStatus;
  tagId?: string;
}
