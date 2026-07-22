import type { AiProviderName } from '@pentesthub/shared';

/// Local-First Migration Phase 1 (BYOK). `encryptedApiKey` is ciphertext
/// (see common/utils/credential-encryption.util.ts) — this repository
/// never decrypts; that happens once, in-memory, inside
/// AiProviderRegistryService.resolveCredential.
export interface AiProviderCredentialRecord {
  id: string;
  workspaceId: string;
  provider: AiProviderName;
  encryptedApiKey: string | null;
  keyPreview: string | null;
  baseUrl: string | null;
  model: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertAiProviderCredentialInput {
  workspaceId: string;
  provider: AiProviderName;
  encryptedApiKey?: string | null;
  keyPreview?: string | null;
  baseUrl?: string | null;
  model?: string | null;
}

/// One row per (workspace, provider) — `upsert` is the only write path
/// (Prisma's `@@unique([workspaceId, provider])` backs it), matching how a
/// settings UI naturally works: "save my OpenAI key" either creates or
/// replaces the workspace's existing OpenAI credential, never creates a
/// second row.
export interface AiProviderCredentialsRepository {
  upsert(
    input: UpsertAiProviderCredentialInput,
  ): Promise<AiProviderCredentialRecord>;
  findByWorkspaceAndProvider(
    workspaceId: string,
    provider: AiProviderName,
  ): Promise<AiProviderCredentialRecord | null>;
  listByWorkspace(workspaceId: string): Promise<AiProviderCredentialRecord[]>;
  delete(workspaceId: string, provider: AiProviderName): Promise<void>;
}

export const AI_PROVIDER_CREDENTIALS_REPOSITORY = Symbol(
  'AI_PROVIDER_CREDENTIALS_REPOSITORY',
);
