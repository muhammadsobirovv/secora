import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AiProviderName } from '@pentesthub/shared';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  AiProviderCredentialRecord,
  AiProviderCredentialsRepository,
  UpsertAiProviderCredentialInput,
} from '../../../domain/repositories/ai-provider-credentials.repository.interface.js';

@Injectable()
export class PrismaAiProviderCredentialsRepository
  implements AiProviderCredentialsRepository
{
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  upsert(
    input: UpsertAiProviderCredentialInput,
  ): Promise<AiProviderCredentialRecord> {
    const shared = {
      encryptedApiKey: input.encryptedApiKey ?? null,
      keyPreview: input.keyPreview ?? null,
      baseUrl: input.baseUrl ?? null,
      model: input.model ?? null,
    };
    return this.txHost.tx.aiProviderCredential.upsert({
      where: {
        workspaceId_provider: {
          workspaceId: input.workspaceId,
          provider: input.provider,
        },
      },
      create: {
        workspaceId: input.workspaceId,
        provider: input.provider,
        ...shared,
      },
      update: shared,
    });
  }

  findByWorkspaceAndProvider(
    workspaceId: string,
    provider: AiProviderName,
  ): Promise<AiProviderCredentialRecord | null> {
    return this.txHost.tx.aiProviderCredential.findUnique({
      where: { workspaceId_provider: { workspaceId, provider } },
    });
  }

  listByWorkspace(workspaceId: string): Promise<AiProviderCredentialRecord[]> {
    return this.txHost.tx.aiProviderCredential.findMany({
      where: { workspaceId },
      orderBy: { provider: 'asc' },
    });
  }

  async delete(workspaceId: string, provider: AiProviderName): Promise<void> {
    await this.txHost.tx.aiProviderCredential
      .delete({ where: { workspaceId_provider: { workspaceId, provider } } })
      .catch(() => {
        // Already gone — delete is idempotent from the caller's
        // perspective (same convention as other soft/hard-delete
        // repositories in this codebase).
      });
  }
}
