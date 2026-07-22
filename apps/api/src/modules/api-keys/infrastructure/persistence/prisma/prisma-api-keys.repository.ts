import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  ApiKeysRepository,
  CreateApiKeyInput,
} from '../../../domain/repositories/api-keys.repository.interface.js';
import type { ApiKey } from '../../../../../prisma-types.js';

@Injectable()
export class PrismaApiKeysRepository implements ApiKeysRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  create(input: CreateApiKeyInput): Promise<ApiKey> {
    return this.txHost.tx.apiKey.create({ data: input });
  }

  findByHash(keyHash: string): Promise<ApiKey | null> {
    return this.txHost.tx.apiKey.findUnique({ where: { keyHash } });
  }

  findByUser(userId: string): Promise<ApiKey[]> {
    return this.txHost.tx.apiKey.findMany({ where: { userId } });
  }

  findByWorkspace(workspaceId: string): Promise<ApiKey[]> {
    return this.txHost.tx.apiKey.findMany({ where: { workspaceId } });
  }

  findById(id: string): Promise<ApiKey | null> {
    return this.txHost.tx.apiKey.findUnique({ where: { id } });
  }

  async revoke(id: string): Promise<void> {
    await this.txHost.tx.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  async touchLastUsed(id: string): Promise<void> {
    await this.txHost.tx.apiKey.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    });
  }
}
