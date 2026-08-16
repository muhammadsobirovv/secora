import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  GlobalSecurityPolicyDto,
  UpdateGlobalSecurityPolicyRequestDto,
} from '@pentesthub/shared';
import { AppException } from '../../common/exceptions/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/// Module 16 — Global Security Policy (task #400). A workspace with no
/// row here gets the safe defaults below — absence of configuration
/// means "safe default," never "unrestricted," matching the posture
/// `QuotaService` already established in Module 15 (no QuotaPolicy row
/// means unlimited *usage*, but every enforcement point that consults a
/// policy still runs the check; it just resolves to a permissive
/// default rather than skipping the check entirely).
const SAFE_DEFAULTS: Omit<GlobalSecurityPolicyDto, 'workspaceId' | 'updatedBy' | 'updatedAt'> = {
  maxScanRatePerMinute: null,
  maxConcurrentJobs: null,
  allowedTools: null,
  blockedTools: null,
  allowedTargetTypes: null,
  requireApprovalFor: null,
  dataRetentionDays: null,
  evidenceRetentionDays: null,
  aiToolPermissions: null,
  pluginPermissions: null,
};

interface GlobalSecurityPolicyRow {
  workspaceId: string;
  maxScanRatePerMinute: number | null;
  maxConcurrentJobs: number | null;
  allowedTools: unknown;
  blockedTools: unknown;
  allowedTargetTypes: unknown;
  requireApprovalFor: unknown;
  dataRetentionDays: number | null;
  evidenceRetentionDays: number | null;
  aiToolPermissions: unknown;
  pluginPermissions: unknown;
  updatedBy: string;
  updatedAt: Date | string;
}

@Injectable()
export class GlobalSecurityPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  private get repo() {
    return (this.prisma as unknown as {
      globalSecurityPolicy: {
        findUnique: (args: unknown) => Promise<GlobalSecurityPolicyRow | null>;
        upsert: (args: unknown) => Promise<GlobalSecurityPolicyRow>;
      };
    }).globalSecurityPolicy;
  }

  async getForWorkspace(workspaceId: string): Promise<GlobalSecurityPolicyDto> {
    const row = await this.repo.findUnique({ where: { workspaceId } });
    if (!row) {
      return { workspaceId, updatedBy: 'system', updatedAt: new Date(0).toISOString(), ...SAFE_DEFAULTS };
    }
    return toDto(row);
  }

  async update(
    workspaceId: string,
    updatedBy: string,
    input: UpdateGlobalSecurityPolicyRequestDto,
  ): Promise<GlobalSecurityPolicyDto> {
    const row = await this.repo.upsert({
      where: { workspaceId },
      create: { workspaceId, updatedBy, ...input },
      update: { updatedBy, ...input },
    });
    return toDto(row);
  }

  /// Called by ScopeEngineService/AdHocCommandService callers alongside
  /// the scope check — throws if the given tool or target type is
  /// blocked by this workspace's policy. `allowedTools`/
  /// `allowedTargetTypes` being null means "no allowlist configured,
  /// everything not explicitly blocked is fine"; a non-null allowlist
  /// means only its members are permitted.
  async assertToolAllowed(workspaceId: string, tool: string, targetType: string): Promise<void> {
    const policy = await this.getForWorkspace(workspaceId);
    const blocked = (policy.blockedTools ?? []).includes(tool);
    if (blocked) {
      throw new AppException(
        'SECURITY_POLICY_TOOL_BLOCKED',
        `Tool "${tool}" is blocked by this workspace's Global Security Policy.`,
        HttpStatus.FORBIDDEN,
      );
    }
    if (policy.allowedTools && !policy.allowedTools.includes(tool)) {
      throw new AppException(
        'SECURITY_POLICY_TOOL_BLOCKED',
        `Tool "${tool}" is not on this workspace's allowed-tools list.`,
        HttpStatus.FORBIDDEN,
      );
    }
    if (policy.allowedTargetTypes && !policy.allowedTargetTypes.includes(targetType)) {
      throw new AppException(
        'SECURITY_POLICY_TARGET_TYPE_BLOCKED',
        `Target type "${targetType}" is not on this workspace's allowed-target-types list.`,
        HttpStatus.FORBIDDEN,
      );
    }
  }
}

function toDto(row: GlobalSecurityPolicyRow): GlobalSecurityPolicyDto {
  return {
    workspaceId: row.workspaceId,
    maxScanRatePerMinute: row.maxScanRatePerMinute,
    maxConcurrentJobs: row.maxConcurrentJobs,
    allowedTools: row.allowedTools as string[] | null,
    blockedTools: row.blockedTools as string[] | null,
    allowedTargetTypes: row.allowedTargetTypes as string[] | null,
    requireApprovalFor: row.requireApprovalFor as string[] | null,
    dataRetentionDays: row.dataRetentionDays,
    evidenceRetentionDays: row.evidenceRetentionDays,
    aiToolPermissions: row.aiToolPermissions as Record<string, boolean> | null,
    pluginPermissions: row.pluginPermissions as Record<string, boolean> | null,
    updatedBy: row.updatedBy,
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}
