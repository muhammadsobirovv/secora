import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import type { AuditEventType } from '../../../prisma-types.js';
import type { ExtensionDto, ExtensionInvocationResultDto, InvokeExtensionRequestDto, RegisterExtensionRequestDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { ResearcherMemoryWorkspaceResolver } from '../../researcher-memory/researcher-memory-workspace.util.js';
import { toExtensionDto } from '../mappers/to-extension-dto.mapper.js';
import { ExtensionPermissionEnforcer } from '../extension-permission-enforcer.util.js';
import { assertSafeWebhookUrl } from '../../../common/utils/ssrf-guard.util.js';

/// A permissive-but-real semver check (`x.y.z`, optional pre-release/
/// build metadata) — "declared version" (spec) needs to be parseable and
/// comparable later (e.g. for update detection), not just a free-text
/// string. Matches the same shape `PluginVersion.version` values use
/// elsewhere in this codebase.
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/;
const NAME_RE = /^[a-z0-9][a-z0-9-_.]{1,99}$/i;

function assertValidManifest(data: RegisterExtensionRequestDto): void {
  const problems: string[] = [];
  if (!NAME_RE.test(data.name)) problems.push('name must be 2-100 alphanumeric/dash/underscore/dot characters');
  if (!SEMVER_RE.test(data.version)) problems.push('version must be valid semver (e.g. 1.0.0)');
  if (!data.entrypoint || data.entrypoint.trim().length === 0) problems.push('entrypoint is required');
  if (!Array.isArray(data.permissions)) problems.push('permissions must be an array');
  if (!Array.isArray(data.capabilities)) problems.push('capabilities must be an array');
  if (problems.length > 0) {
    throw new AppException('EXTENSION_MANIFEST_INVALID', `Invalid extension manifest: ${problems.join('; ')}.`, HttpStatus.BAD_REQUEST);
  }
}

async function findOwnedExtension(prisma: PrismaService, id: string, workspaceId: string) {
  const extension = await prisma.extensionRegistration.findFirst({ where: { id, workspaceId } });
  if (!extension) {
    throw new AppException('EXTENSION_NOT_FOUND', 'Extension not found.', HttpStatus.NOT_FOUND);
  }
  return extension;
}

async function recordExtensionAudit(
  prisma: PrismaService,
  userId: string,
  extensionId: string,
  workspaceId: string,
  type: AuditEventType,
  metadata: Record<string, unknown>,
): Promise<void> {
  await prisma.auditEvent.create({
    data: { userId, type, ipAddress: '0.0.0.0', userAgent: 'api', metadata: { extensionId, workspaceId, ...metadata } },
  });
}

/// "Register" (spec) — validates the manifest, rejects a duplicate
/// (workspaceId, name, version) triple (`EXTENSION_ALREADY_REGISTERED`,
/// enforced by both this check and the DB's own unique index as
/// defense-in-depth), and writes an `EXTENSION_REGISTERED` audit event.
export class RegisterExtensionCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: RegisterExtensionRequestDto,
  ) {}
}

@CommandHandler(RegisterExtensionCommand)
export class RegisterExtensionHandler implements ICommandHandler<RegisterExtensionCommand, ExtensionDto> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceResolver: ResearcherMemoryWorkspaceResolver,
  ) {}

  async execute(command: RegisterExtensionCommand): Promise<ExtensionDto> {
    assertValidManifest(command.data);
    const workspaceId = await this.workspaceResolver.resolve(command.userId);

    const duplicate = await this.prisma.extensionRegistration.findFirst({
      where: { workspaceId, name: command.data.name, version: command.data.version },
    });
    if (duplicate) {
      throw new AppException(
        'EXTENSION_ALREADY_REGISTERED',
        'An extension with this name and version is already registered in this workspace.',
        HttpStatus.CONFLICT,
      );
    }

    const created = await this.prisma.extensionRegistration.create({
      data: {
        workspaceId,
        name: command.data.name,
        version: command.data.version,
        type: command.data.type,
        permissions: command.data.permissions,
        capabilities: command.data.capabilities,
        entrypoint: command.data.entrypoint,
        metadata: command.data.metadata ?? undefined,
        registeredBy: command.userId,
        enabled: true,
      },
    });

    await recordExtensionAudit(this.prisma, command.userId, created.id, workspaceId, 'EXTENSION_REGISTERED', {
      name: created.name,
      version: created.version,
      type: created.type,
      permissions: created.permissions,
    });

    return toExtensionDto(created);
  }
}

export class EnableExtensionCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly extensionId: string,
  ) {}
}

@CommandHandler(EnableExtensionCommand)
export class EnableExtensionHandler implements ICommandHandler<EnableExtensionCommand, ExtensionDto> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceResolver: ResearcherMemoryWorkspaceResolver,
  ) {}

  async execute(command: EnableExtensionCommand): Promise<ExtensionDto> {
    const workspaceId = await this.workspaceResolver.resolve(command.userId);
    const existing = await findOwnedExtension(this.prisma, command.extensionId, workspaceId);
    const updated = await this.prisma.extensionRegistration.update({ where: { id: existing.id }, data: { enabled: true } });
    await recordExtensionAudit(this.prisma, command.userId, existing.id, workspaceId, 'EXTENSION_ENABLED', {
      name: existing.name,
      version: existing.version,
    });
    return toExtensionDto(updated);
  }
}

export class DisableExtensionCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly extensionId: string,
  ) {}
}

@CommandHandler(DisableExtensionCommand)
export class DisableExtensionHandler implements ICommandHandler<DisableExtensionCommand, ExtensionDto> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceResolver: ResearcherMemoryWorkspaceResolver,
  ) {}

  async execute(command: DisableExtensionCommand): Promise<ExtensionDto> {
    const workspaceId = await this.workspaceResolver.resolve(command.userId);
    const existing = await findOwnedExtension(this.prisma, command.extensionId, workspaceId);
    const updated = await this.prisma.extensionRegistration.update({ where: { id: existing.id }, data: { enabled: false } });
    await recordExtensionAudit(this.prisma, command.userId, existing.id, workspaceId, 'EXTENSION_DISABLED', {
      name: existing.name,
      version: existing.version,
    });
    return toExtensionDto(updated);
  }
}

/// "Unregister" (spec) — a real delete, not a soft-disable (that's what
/// `DisableExtensionCommand` is for); writes `EXTENSION_UNREGISTERED`
/// before the row disappears so the audit trail survives the deletion.
export class UnregisterExtensionCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly extensionId: string,
  ) {}
}

@CommandHandler(UnregisterExtensionCommand)
export class UnregisterExtensionHandler implements ICommandHandler<UnregisterExtensionCommand, void> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceResolver: ResearcherMemoryWorkspaceResolver,
  ) {}

  async execute(command: UnregisterExtensionCommand): Promise<void> {
    const workspaceId = await this.workspaceResolver.resolve(command.userId);
    const existing = await findOwnedExtension(this.prisma, command.extensionId, workspaceId);
    await recordExtensionAudit(this.prisma, command.userId, existing.id, workspaceId, 'EXTENSION_UNREGISTERED', {
      name: existing.name,
      version: existing.version,
    });
    await this.prisma.extensionRegistration.delete({ where: { id: existing.id } });
  }
}

/// Hardening pass (task #454): the real caller `ExtensionPermissionEnforcer`
/// was built for but never had. "Invoke" per this registry's disclosed
/// scope: authorize + relay, not execute — this does not itself run
/// recon/scanner/agent/workflow-specific logic for each of the seven
/// `ExtensionType`s (that would require deep integration into
/// ToolRunner/the Agent framework/the Workflow engine per type, out of
/// scope for this pass and not silently attempted). Instead it provides
/// one uniform mechanism every extension type can use identically: a
/// permission-checked, SSRF-guarded, timeout-bounded HTTP POST to the
/// extension's own declared `entrypoint`, mirroring
/// `WebhookDeliveryQueueService.attemptDelivery` (same `assertSafeWebhookUrl`
/// re-check-on-every-call posture, same `fetch` + `AbortSignal.timeout`
/// pattern) rather than inventing a second HTTP-egress code path with
/// different safety properties.
const INVOKE_TIMEOUT_MS = 10_000;
const MAX_INPUT_JSON_LENGTH = 100_000; // ~100KB — bounds what gets relayed to an entrypoint.

export class InvokeExtensionCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly extensionId: string,
    public readonly data: InvokeExtensionRequestDto,
  ) {}
}

@CommandHandler(InvokeExtensionCommand)
export class InvokeExtensionHandler implements ICommandHandler<InvokeExtensionCommand, ExtensionInvocationResultDto> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceResolver: ResearcherMemoryWorkspaceResolver,
    private readonly permissionEnforcer: ExtensionPermissionEnforcer,
  ) {}

  async execute(command: InvokeExtensionCommand): Promise<ExtensionInvocationResultDto> {
    const workspaceId = await this.workspaceResolver.resolve(command.userId);
    const extension = await findOwnedExtension(this.prisma, command.extensionId, workspaceId);

    // Authorize before anything else touches the network — a disabled
    // extension or an undeclared permission must never reach
    // assertSafeWebhookUrl/fetch at all.
    this.permissionEnforcer.assertAuthorized(extension, command.data.permission);

    const inputJson = JSON.stringify(command.data.input ?? {});
    if (inputJson.length > MAX_INPUT_JSON_LENGTH) {
      throw new AppException(
        'EXTENSION_INVOKE_INPUT_TOO_LARGE',
        `Invocation input must be at most ${MAX_INPUT_JSON_LENGTH} bytes of JSON.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Re-checked on every single invocation, not just at registration
    // time — same DNS-rebinding rationale as the webhook delivery queue's
    // per-attempt re-check (an entrypoint hostname that resolved safely
    // at registration time can be re-pointed at a private address later).
    await assertSafeWebhookUrl(extension.entrypoint);

    const startedAt = Date.now();
    let result: ExtensionInvocationResultDto;
    try {
      const response = await fetch(extension.entrypoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-PentestHub-Extension-Id': extension.id,
          'X-PentestHub-Extension-Permission': command.data.permission,
        },
        body: JSON.stringify({
          extensionId: extension.id,
          type: extension.type,
          capabilities: extension.capabilities,
          permission: command.data.permission,
          input: command.data.input ?? {},
        }),
        signal: AbortSignal.timeout(INVOKE_TIMEOUT_MS),
      });

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = undefined; // Non-JSON or empty response body — not an error by itself.
      }

      result = {
        ok: response.ok,
        statusCode: response.status,
        durationMs: Date.now() - startedAt,
        body,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch (error) {
      result = {
        ok: false,
        statusCode: null,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'Unknown error invoking extension entrypoint.',
      };
    }

    await recordExtensionAudit(this.prisma, command.userId, extension.id, workspaceId, 'EXTENSION_INVOKED', {
      name: extension.name,
      version: extension.version,
      permission: command.data.permission,
      ok: result.ok,
      statusCode: result.statusCode,
      durationMs: result.durationMs,
    });

    return result;
  }
}
