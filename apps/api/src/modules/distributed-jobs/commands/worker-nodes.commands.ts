import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import type { RegisterWorkerNodeRequestDto, WorkerNodeDto } from '@pentesthub/shared';
import type { AuditEventType } from '../../../prisma-types.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveOrganizationMembership } from '../../enterprise/organization-membership.util.js';
import { requireEnterpriseRole } from '../../enterprise/enterprise-permissions.util.js';
import { toWorkerNodeDto } from '../mappers/to-distributed-job-dto.mapper.js';

/// A worker process registers itself once at startup, authenticated the
/// same way the Public API surface authenticates any machine caller —
/// via `ApiKeyAuthGuard` (`X-API-Key`, Module 9) rather than a JWT. The
/// key's `userId` must be an ADMIN+ member of the target organization
/// (the same "operator provisions a service-account API key" pattern used
/// for any headless integration in this codebase), so registering a
/// worker never needs a new authentication mechanism.
export class RegisterWorkerNodeCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly data: RegisterWorkerNodeRequestDto,
  ) {}
}

@CommandHandler(RegisterWorkerNodeCommand)
export class RegisterWorkerNodeHandler implements ICommandHandler<RegisterWorkerNodeCommand, WorkerNodeDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: RegisterWorkerNodeCommand): Promise<WorkerNodeDto> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'ADMIN');

    const node = await this.prisma.workerNode.create({
      data: {
        organizationId: command.organizationId,
        name: command.data.name,
        hostname: command.data.hostname,
        capabilities: command.data.capabilities,
        maxConcurrency: command.data.maxConcurrency ?? 4,
      },
    });

    const type: AuditEventType = 'WORKER_NODE_REGISTERED';
    await this.prisma.auditEvent.create({
      data: {
        userId: command.userId,
        type,
        ipAddress: '0.0.0.0',
        userAgent: 'worker',
        metadata: { organizationId: command.organizationId, workerId: node.id, hostname: node.hostname },
      },
    });

    return toWorkerNodeDto(node);
  }
}

/// Renews `lastHeartbeatAt` and refreshes reported `currentLoad` — called
/// on an interval by the worker process itself (see
/// `apps/api/src/worker-nodes-client-example.md` / the Desktop-Agent-style
/// heartbeat loop documented in docs/modules/10-*.md). Reviving a
/// previously UNHEALTHY node back to ONLINE on a fresh heartbeat is the
/// "worker auto-recovery" half of dead-worker handling; the other half
/// (detecting silence) is `WorkerReaperService`.
export class HeartbeatWorkerNodeCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly workerId: string,
    public readonly currentLoad?: number,
  ) {}
}

@CommandHandler(HeartbeatWorkerNodeCommand)
export class HeartbeatWorkerNodeHandler implements ICommandHandler<HeartbeatWorkerNodeCommand, WorkerNodeDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: HeartbeatWorkerNodeCommand): Promise<WorkerNodeDto> {
    const existing = await this.prisma.workerNode.findUnique({ where: { id: command.workerId } });
    if (!existing) {
      throw new AppException('WORKER_NODE_NOT_FOUND', 'Worker node not found.', HttpStatus.NOT_FOUND);
    }
    const node = await this.prisma.workerNode.update({
      where: { id: command.workerId },
      data: {
        lastHeartbeatAt: new Date(),
        currentLoad: command.currentLoad,
        status: existing.status === 'DRAINING' ? 'DRAINING' : 'ONLINE',
      },
    });
    return toWorkerNodeDto(node);
  }
}

/// Draining stops new job assignment to this node (see
/// `ClaimNextJobsHandler`'s `status: 'ONLINE'` filter) without forcibly
/// killing whatever it's already running — the standard "let in-flight
/// work finish, then take the node down" pattern for planned maintenance/
/// scale-down, distinct from the unplanned-failure path
/// (`WorkerReaperService`).
export class DrainWorkerNodeCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly workerId: string,
  ) {}
}

@CommandHandler(DrainWorkerNodeCommand)
export class DrainWorkerNodeHandler implements ICommandHandler<DrainWorkerNodeCommand, void> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: DrainWorkerNodeCommand): Promise<void> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'ADMIN');

    const node = await this.prisma.workerNode.findFirst({
      where: { id: command.workerId, organizationId: command.organizationId },
    });
    if (!node) {
      throw new AppException('WORKER_NODE_NOT_FOUND', 'Worker node not found.', HttpStatus.NOT_FOUND);
    }
    await this.prisma.workerNode.update({ where: { id: node.id }, data: { status: 'DRAINING' } });
  }
}

export class DeregisterWorkerNodeCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly workerId: string,
  ) {}
}

@CommandHandler(DeregisterWorkerNodeCommand)
export class DeregisterWorkerNodeHandler implements ICommandHandler<DeregisterWorkerNodeCommand, void> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: DeregisterWorkerNodeCommand): Promise<void> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'ADMIN');

    const node = await this.prisma.workerNode.findFirst({
      where: { id: command.workerId, organizationId: command.organizationId },
    });
    if (!node) {
      throw new AppException('WORKER_NODE_NOT_FOUND', 'Worker node not found.', HttpStatus.NOT_FOUND);
    }
    // Any job still assigned to this node is put back in the queue rather
    // than left orphaned — same migration behavior WorkerReaperService
    // applies to a silently-dead node, just triggered explicitly instead
    // of by heartbeat timeout.
    await this.prisma.$transaction([
      this.prisma.distributedJob.updateMany({
        where: { workerId: node.id, status: { in: ['ASSIGNED', 'RUNNING'] } },
        data: { status: 'QUEUED', workerId: null },
      }),
      this.prisma.workerNode.delete({ where: { id: node.id } }),
    ]);
  }
}
