import type { ApiKey } from '../../../../prisma-types.js';

export interface CreateApiKeyInput {
  userId: string;
  /// Module 9 addition — nullable, matches `ApiKey.workspaceId`'s
  /// Prisma-level doc comment: null = personal key, set = workspace key.
  workspaceId?: string;
  name: string;
  keyHash: string;
  prefix: string;
  scopes: string[];
  expiresAt?: Date;
  /// Module 15 — API key management (task #336).
  ipAllowlist?: string[];
  rateLimitPerMinute?: number;
  rotatedFromId?: string;
}

/// Module 9 activates this module (Module 1 left it schema+repository
/// only, see decision 8 in docs/adr/0001-auth-module.md) by adding the
/// create/list/revoke endpoints and an API-key auth strategy —
/// `public-api/` — plus workspace-scoped keys (`findByWorkspace`) on top
/// of Module 1's original personal-key-only shape.
export interface ApiKeysRepository {
  create(input: CreateApiKeyInput): Promise<ApiKey>;
  findByHash(keyHash: string): Promise<ApiKey | null>;
  findByUser(userId: string): Promise<ApiKey[]>;
  findByWorkspace(workspaceId: string): Promise<ApiKey[]>;
  findById(id: string): Promise<ApiKey | null>;
  revoke(id: string): Promise<void>;
  touchLastUsed(id: string): Promise<void>;
}

export const API_KEYS_REPOSITORY = Symbol('API_KEYS_REPOSITORY');
