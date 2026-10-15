import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus, Inject } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { AuditEventType } from '../../../prisma-types.js';
import type { CreateApiKeyRequestDto, CreateApiKeyResultDto, RotateApiKeyResultDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  API_KEYS_REPOSITORY,
  type ApiKeysRepository,
} from '../../api-keys/domain/repositories/api-keys.repository.interface.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveWorkspaceMembership } from '../../collaboration/workspace-membership.util.js';
import { requireRole } from '../../collaboration/permissions.util.js';
import { toApiKeyDto } from '../mappers/to-api-key-dto.mapper.js';

/// Raw key format: `phb_<32 random bytes, base64url>` — the `phb_`
/// prefix (Secora) lets a secret-scanner (GitHub push protection,
/// Trufflehog, etc.) recognize a leaked key by pattern the same way
/// `sk-`/`ghp_`-style provider keys do. Only the sha256 hash is ever
/// stored (see api-keys.repository.interface.ts — matches the
/// RefreshToken/EmailVerificationToken pattern used everywhere else in
/// this codebase for high-entropy opaque tokens).
function generateRawApiKey(): { rawKey: string; keyHash: string; prefix: string } {
  const rawKey = `phb_${randomBytes(32).toString('base64url')}`;
  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  return { rawKey, keyHash, prefix: rawKey.slice(0, 12) };
}

export class CreateApiKeyCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: CreateApiKeyRequestDto,
  ) {}
}

@CommandHandler(CreateApiKeyCommand)
export class CreateApiKeyHandler implements ICommandHandler<CreateApiKeyCommand, CreateApiKeyResultDto> {
  constructor(
    @Inject(API_KEYS_REPOSITORY) private readonly apiKeysRepository: ApiKeysRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(command: CreateApiKeyCommand): Promise<CreateApiKeyResultDto> {
    if (command.data.workspaceId) {
      // Workspace keys require MANAGER+ — a MEMBER/REVIEWER shouldn't be
      // able to mint a credential that acts with the workspace's full API
      // surface.
      const { role } = await resolveWorkspaceMembership(this.prisma, command.userId, command.data.workspaceId);
      requireRole(role, 'MANAGER');
    }

    const { rawKey, keyHash, prefix } = generateRawApiKey();
    const expiresAt = command.data.expiresInDays
      ? new Date(Date.now() + command.data.expiresInDays * 24 * 60 * 60 * 1000)
      : undefined;

    const apiKey = await this.apiKeysRepository.create({
      userId: command.userId,
      workspaceId: command.data.workspaceId,
      name: command.data.name,
      keyHash,
      prefix,
      scopes: command.data.scopes ?? [],
      expiresAt,
      ipAllowlist: command.data.ipAllowlist,
      rateLimitPerMinute: command.data.rateLimitPerMinute,
    });

    await this.recordAudit(command.userId, apiKey.id, command.data.workspaceId);

    return { apiKey: toApiKeyDto(apiKey), rawKey };
  }

  private async recordAudit(userId: string, apiKeyId: string, workspaceId: string | undefined): Promise<void> {
    const type: AuditEventType = 'API_KEY_CREATED';
    await this.prisma.auditEvent.create({
      data: {
        userId,
        type,
        ipAddress: '0.0.0.0',
        userAgent: 'api',
        metadata: { apiKeyId, workspaceId },
      },
    });
  }
}

// Module 15 — API key management (task #336)
export class RotateApiKeyCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly apiKeyId: string,
  ) {}
}

@CommandHandler(RotateApiKeyCommand)
export class RotateApiKeyHandler implements ICommandHandler<RotateApiKeyCommand, RotateApiKeyResultDto> {
  constructor(
    @Inject(API_KEYS_REPOSITORY) private readonly apiKeysRepository: ApiKeysRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(command: RotateApiKeyCommand): Promise<RotateApiKeyResultDto> {
    const existing = await this.apiKeysRepository.findById(command.apiKeyId);
    if (!existing) {
      throw new AppException('API_KEY_NOT_FOUND', 'API key not found.', HttpStatus.NOT_FOUND);
    }
    if (existing.userId !== command.userId) {
      if (!existing.workspaceId) {
        throw new AppException('API_KEY_NOT_FOUND', 'API key not found.', HttpStatus.NOT_FOUND);
      }
      const { role } = await resolveWorkspaceMembership(this.prisma, command.userId, existing.workspaceId);
      requireRole(role, 'ADMIN');
    }
    if (existing.revokedAt) {
      throw new AppException('API_KEY_NOT_FOUND', 'Cannot rotate an already-revoked API key.', HttpStatus.CONFLICT);
    }

    const { rawKey, keyHash, prefix } = generateRawApiKey();
    const rotated = await this.apiKeysRepository.create({
      userId: existing.userId,
      workspaceId: existing.workspaceId ?? undefined,
      name: existing.name,
      keyHash,
      prefix,
      scopes: existing.scopes,
      expiresAt: existing.expiresAt ?? undefined,
      ipAllowlist: existing.ipAllowlist,
      rateLimitPerMinute: existing.rateLimitPerMinute ?? undefined,
      rotatedFromId: existing.id,
    });
    await this.apiKeysRepository.revoke(existing.id);

    const type: AuditEventType = 'API_KEY_REVOKED';
    await this.prisma.auditEvent.create({
      data: {
        userId: command.userId,
        type,
        ipAddress: '0.0.0.0',
        userAgent: 'api',
        metadata: { apiKeyId: existing.id, rotatedToId: rotated.id, reason: 'rotated' },
      },
    });

    return { apiKey: toApiKeyDto(rotated), rawKey };
  }
}

export class RevokeApiKeyCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly apiKeyId: string,
  ) {}
}

@CommandHandler(RevokeApiKeyCommand)
export class RevokeApiKeyHandler implements ICommandHandler<RevokeApiKeyCommand, void> {
  constructor(
    @Inject(API_KEYS_REPOSITORY) private readonly apiKeysRepository: ApiKeysRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(command: RevokeApiKeyCommand): Promise<void> {
    const apiKey = await this.apiKeysRepository.findById(command.apiKeyId);
    if (!apiKey) {
      throw new AppException('API_KEY_NOT_FOUND', 'API key not found.', HttpStatus.NOT_FOUND);
    }
    // Owning user can always revoke their own key; for a workspace key,
    // a workspace ADMIN+ can also revoke it (e.g. offboarding a member
    // who minted one).
    if (apiKey.userId !== command.userId) {
      if (!apiKey.workspaceId) {
        throw new AppException('API_KEY_NOT_FOUND', 'API key not found.', HttpStatus.NOT_FOUND);
      }
      const { role } = await resolveWorkspaceMembership(this.prisma, command.userId, apiKey.workspaceId);
      requireRole(role, 'ADMIN');
    }

    await this.apiKeysRepository.revoke(apiKey.id);
    const type: AuditEventType = 'API_KEY_REVOKED';
    await this.prisma.auditEvent.create({
      data: {
        userId: command.userId,
        type,
        ipAddress: '0.0.0.0',
        userAgent: 'api',
        metadata: { apiKeyId: apiKey.id },
      },
    });
  }
}
