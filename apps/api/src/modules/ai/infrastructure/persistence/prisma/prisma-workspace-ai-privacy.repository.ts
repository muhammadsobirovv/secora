import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AiPrivacyMode } from '@pentesthub/shared';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  WorkspaceAiPrivacyRepository,
  WorkspaceAiPrivacySettingRecord,
} from '../../../domain/repositories/workspace-ai-privacy.repository.interface.js';

/// See the doc comment on WorkspaceAiPrivacyRepository — raw SQL only, same
/// reasoning as PrismaPromptTemplateRepository/PrismaKnowledgeBaseReferenceRepository.
@Injectable()
export class PrismaWorkspaceAiPrivacyRepository implements WorkspaceAiPrivacyRepository {
  constructor(private readonly txHost: TransactionHost<AppTransactionalAdapter>) {}

  async findByWorkspaceId(workspaceId: string): Promise<WorkspaceAiPrivacySettingRecord | null> {
    const rows = await this.txHost.tx.$queryRaw<WorkspaceAiPrivacySettingRecord[]>`
      SELECT * FROM "workspace_ai_privacy_settings" WHERE "workspaceId" = ${workspaceId}
    `;
    return rows[0] ?? null;
  }

  async upsert(workspaceId: string, mode: AiPrivacyMode): Promise<WorkspaceAiPrivacySettingRecord> {
    const rows = await this.txHost.tx.$queryRaw<WorkspaceAiPrivacySettingRecord[]>`
      INSERT INTO "workspace_ai_privacy_settings" ("workspaceId", "mode", "createdAt", "updatedAt")
      VALUES (${workspaceId}, ${mode}::"AiPrivacyMode", now(), now())
      ON CONFLICT ("workspaceId") DO UPDATE SET
        "mode" = EXCLUDED."mode",
        "updatedAt" = now()
      RETURNING *
    `;
    return rows[0];
  }
}
