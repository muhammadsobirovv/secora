import type { ApiKey } from '../../../../prisma-types.js';

export interface CreateApiKeyInput {
  userId: string;
  name: string;
  keyHash: string;
  prefix: string;
  scopes: string[];
  expiresAt?: Date;
}

/// Foundation only — no create/list/revoke endpoints or API-key auth
/// strategy this sprint (see decision 8, docs/adr/0001-auth-module.md).
export interface ApiKeysRepository {
  create(input: CreateApiKeyInput): Promise<ApiKey>;
  findByHash(keyHash: string): Promise<ApiKey | null>;
  findByUser(userId: string): Promise<ApiKey[]>;
  revoke(id: string): Promise<void>;
}

export const API_KEYS_REPOSITORY = Symbol('API_KEYS_REPOSITORY');
