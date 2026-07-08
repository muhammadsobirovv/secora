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

export type TargetEnvironment = "PRODUCTION" | "STAGING" | "DEVELOPMENT" | "UNKNOWN";
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
