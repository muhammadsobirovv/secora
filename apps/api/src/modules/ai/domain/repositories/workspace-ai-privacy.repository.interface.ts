import type { AiPrivacyMode } from '@pentesthub/shared';

/// Module 11 — Privacy controls (task #234). Raw-SQL-only access, same
/// reasoning as every other Module 11 addition: WorkspaceAiPrivacySetting
/// exists in schema.prisma / the DB via a hand-applied migration but not in
/// the generated Prisma Client in this sandbox (`prisma generate` cannot be
/// re-run here), so it must be reached through $queryRaw/$executeRaw. See
/// PrismaWorkspaceAiPrivacyRepository.
///
/// Lives under the `ai` module (not `agent`) because the enforcement point
/// is AiProviderRegistryService.resolveProvider — agent-core.module.ts
/// already imports AiCoreModule, so putting this here (rather than under
/// agent/domain) avoids a reverse ai -> agent import edge.
export interface WorkspaceAiPrivacySettingRecord {
  workspaceId: string;
  mode: AiPrivacyMode;
  /// Module 15 — Local-first AI confirmation (task #341). Null until the
  /// workspace has explicitly confirmed CLOUD/HYBRID usage at least once.
  cloudUsageConfirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspaceAiPrivacyRepository {
  /// Returns null when the workspace has never set an explicit mode — the
  /// caller should fall back to the AI_ORCHESTRATOR_MODE env default (see
  /// AiPrivacyModeService.resolveMode).
  findByWorkspaceId(workspaceId: string): Promise<WorkspaceAiPrivacySettingRecord | null>;
  /// `confirmCloudUsage: true` stamps cloudUsageConfirmedAt = now() (only
  /// if not already set — never overwritten once confirmed); false leaves
  /// any existing confirmation timestamp untouched. See
  /// AiPrivacyModeService.setMode for the "must confirm before CLOUD/
  /// HYBRID" gate this supports.
  upsert(
    workspaceId: string,
    mode: AiPrivacyMode,
    confirmCloudUsage: boolean,
  ): Promise<WorkspaceAiPrivacySettingRecord>;
}

export const WORKSPACE_AI_PRIVACY_REPOSITORY = Symbol('WORKSPACE_AI_PRIVACY_REPOSITORY');
