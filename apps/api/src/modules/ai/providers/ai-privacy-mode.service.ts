import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiPrivacyMode, WorkspaceAiPrivacySettingDto } from '@pentesthub/shared';
import type { EnvConfig } from '../../../config/env.validation.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACE_AI_PRIVACY_REPOSITORY,
  type WorkspaceAiPrivacyRepository,
} from '../domain/repositories/workspace-ai-privacy.repository.interface.js';

/// Module 11 — Privacy controls (task #234). The single place that answers
/// "what AI privacy mode applies to this workspace right now" — a
/// workspace's own WorkspaceAiPrivacySetting row if one exists, else the
/// operator-level AI_ORCHESTRATOR_MODE env default (env.validation.ts).
/// AiProviderRegistryService.resolveProvider consults this to decide which
/// providers are eligible candidates (see LOCAL_AI_PROVIDER_NAMES in
/// packages/shared/src/ai.ts).
///
/// Honest scope note (see ADR 0007): this only gates *which backend AI
/// provider* a request may use. It does not implement ADR 0007's full
/// definition of "local" (routing execution to the Desktop Agent) — that
/// remains a documented gap, not something this task claims to close.
///
/// Module 15 — Local-first AI confirmation (task #341). setMode now
/// requires an explicit one-time confirmation (`confirmCloudUsage: true`)
/// before a workspace can switch into CLOUD or HYBRID mode, throwing
/// AI_CLOUD_USAGE_NOT_CONFIRMED otherwise — deliberately enforced only at
/// this single write path (not inside AiProviderRegistryService's hot-path
/// resolveProvider) so it stays a one-time consent gate on the rarely-called
/// "change privacy mode" command rather than a per-turn check that would
/// change today's already-tested CLOUD-mode "unrestricted" resolution
/// behavior (see ai-provider-registry.service.spec.ts).
@Injectable()
export class AiPrivacyModeService {
  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    @Inject(WORKSPACE_AI_PRIVACY_REPOSITORY)
    private readonly repository: WorkspaceAiPrivacyRepository,
  ) {}

  private getEnvDefault(): AiPrivacyMode {
    return this.configService.get('AI_ORCHESTRATOR_MODE', { infer: true });
  }

  async resolveMode(workspaceId: string): Promise<AiPrivacyMode> {
    const setting = await this.repository.findByWorkspaceId(workspaceId);
    return setting?.mode ?? this.getEnvDefault();
  }

  async getSetting(workspaceId: string): Promise<WorkspaceAiPrivacySettingDto> {
    const setting = await this.repository.findByWorkspaceId(workspaceId);
    if (setting) {
      return {
        workspaceId: setting.workspaceId,
        mode: setting.mode,
        updatedAt: setting.updatedAt.toISOString(),
        cloudUsageConfirmedAt: setting.cloudUsageConfirmedAt?.toISOString() ?? null,
      };
    }
    // No explicit row yet — report the effective (env-default) mode, with
    // updatedAt reflecting "now" since there's no persisted change to date.
    return {
      workspaceId,
      mode: this.getEnvDefault(),
      updatedAt: new Date().toISOString(),
      cloudUsageConfirmedAt: null,
    };
  }

  async setMode(
    workspaceId: string,
    mode: AiPrivacyMode,
    confirmCloudUsage = false,
  ): Promise<WorkspaceAiPrivacySettingDto> {
    if (mode !== 'LOCAL' && !confirmCloudUsage) {
      const existing = await this.repository.findByWorkspaceId(workspaceId);
      if (!existing?.cloudUsageConfirmedAt) {
        throw new AppException(
          'AI_CLOUD_USAGE_NOT_CONFIRMED',
          'This workspace has not yet confirmed cloud AI usage — resubmit with confirmCloudUsage: true to acknowledge that CLOUD/HYBRID mode sends data to a third-party AI provider.',
          HttpStatus.CONFLICT,
        );
      }
    }
    const setting = await this.repository.upsert(workspaceId, mode, confirmCloudUsage);
    return {
      workspaceId: setting.workspaceId,
      mode: setting.mode,
      updatedAt: setting.updatedAt.toISOString(),
      cloudUsageConfirmedAt: setting.cloudUsageConfirmedAt?.toISOString() ?? null,
    };
  }
}
