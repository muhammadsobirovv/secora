import type { AiProviderCredentialDto } from '@pentesthub/shared';
import type { AiProviderCredentialRecord } from '../domain/repositories/ai-provider-credentials.repository.interface.js';

/// Deliberately omits `encryptedApiKey` (see AiProviderCredentialRecord's
/// doc comment) — `keyPreview` is the only key-derived field that ever
/// reaches the frontend.
export function toAiProviderCredentialDto(
  record: AiProviderCredentialRecord,
): AiProviderCredentialDto {
  return {
    id: record.id,
    provider: record.provider,
    keyPreview: record.keyPreview,
    baseUrl: record.baseUrl,
    model: record.model,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
