import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import type {
  ApprovalRequestDto,
  ApprovalWorkflowDto,
  CreateApprovalRequestRequestDto,
  CreateApprovalWorkflowRequestDto,
  CreateCustomRoleRequestDto,
  CreatePermissionGroupRequestDto,
  CreateResourcePermissionRequestDto,
  CustomRoleDto,
  DecideApprovalRequestRequestDto,
  GrantTemporaryPermissionRequestDto,
  PermissionGroupDto,
  ResourcePermissionDto,
  TemporaryPermissionDto,
} from '@pentesthub/shared';
import type { AuditEventType } from '../../../prisma-types.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveOrganizationMembership } from '../organization-membership.util.js';
import { requireEnterpriseRole } from '../enterprise-permissions.util.js';
import {
  toApprovalRequestDto,
  toApprovalWorkflowDto,
  toCustomRoleDto,
  toPermissionGroupDto,
  toResourcePermissionDto,
  toTemporaryPermissionDto,
} from '../mappers/to-enterprise-dto.mapper.js';

// ---------------------------------------------------------------------------
// Custom roles / permission groups
// ---------------------------------------------------------------------------

export class CreateCustomRoleCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly data: CreateCustomRoleRequestDto,
  ) {}
}

@CommandHandler(CreateCustomRoleCommand)
export class CreateCustomRoleHandler implements ICommandHandler<CreateCustomRoleCommand, CustomRoleDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CreateCustomRoleCommand): Promise<CustomRoleDto> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'ADMIN');

    const created = await this.prisma.customRole.create({
      data: {
        organizationId: command.organizationId,
        name: command.data.name,
        description: command.data.description,
        basedOnRole: command.data.basedOnRole,
        permissions: { create: command.data.permissionKeys.map((permissionKey) => ({ permissionKey })) },
      },
      include: { permissions: true },
    });
    return toCustomRoleDto(created);
  }
}

export class CreatePermissionGroupCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly data: CreatePermissionGroupRequestDto,
  ) {}
}

@CommandHandler(CreatePermissionGroupCommand)
export class CreatePermissionGroupHandler
  implements ICommandHandler<CreatePermissionGroupCommand, PermissionGroupDto>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CreatePermissionGroupCommand): Promise<PermissionGroupDto> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'ADMIN');

    const created = await this.prisma.permissionGroup.create({
      data: {
        organizationId: command.organizationId,
        name: command.data.name,
        permissionKeys: command.data.permissionKeys,
      },
    });
    return toPermissionGroupDto(created);
  }
}

// ---------------------------------------------------------------------------
// ABAC: resource permissions
// ---------------------------------------------------------------------------

export class CreateResourcePermissionCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly data: CreateResourcePermissionRequestDto,
  ) {}
}

@CommandHandler(CreateResourcePermissionCommand)
export class CreateResourcePermissionHandler
  implements ICommandHandler<CreateResourcePermissionCommand, ResourcePermissionDto>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CreateResourcePermissionCommand): Promise<ResourcePermissionDto> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    // ABAC rule authoring is a Security Manager+ action — it can grant or
    // deny access across the whole org, a more sensitive lever than a
    // single role assignment.
    requireEnterpriseRole(role, 'SECURITY_MANAGER');

    const created = await this.prisma.resourcePermission.create({
      data: {
        organizationId: command.organizationId,
        subjectType: command.data.subjectType,
        subjectId: command.data.subjectId,
        resourceType: command.data.resourceType,
        resourceId: command.data.resourceId,
        action: command.data.action,
        effect: command.data.effect,
        conditions: command.data.conditions,
      },
    });
    return toResourcePermissionDto(created);
  }
}

export class DeleteResourcePermissionCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly resourcePermissionId: string,
  ) {}
}

@CommandHandler(DeleteResourcePermissionCommand)
export class DeleteResourcePermissionHandler
  implements ICommandHandler<DeleteResourcePermissionCommand, void>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: DeleteResourcePermissionCommand): Promise<void> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'SECURITY_MANAGER');

    const existing = await this.prisma.resourcePermission.findFirst({
      where: { id: command.resourcePermissionId, organizationId: command.organizationId },
    });
    if (!existing) {
      throw new AppException('RESOURCE_PERMISSION_NOT_FOUND', 'Resource permission not found.', HttpStatus.NOT_FOUND);
    }
    await this.prisma.resourcePermission.delete({ where: { id: command.resourcePermissionId } });
  }
}

// ---------------------------------------------------------------------------
// Temporary permissions
// ---------------------------------------------------------------------------

export class GrantTemporaryPermissionCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly data: GrantTemporaryPermissionRequestDto,
  ) {}
}

@CommandHandler(GrantTemporaryPermissionCommand)
export class GrantTemporaryPermissionHandler
  implements ICommandHandler<GrantTemporaryPermissionCommand, TemporaryPermissionDto>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: GrantTemporaryPermissionCommand): Promise<TemporaryPermissionDto> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'SECURITY_MANAGER');

    const created = await this.prisma.temporaryPermission.create({
      data: {
        organizationId: command.organizationId,
        userId: command.data.userId,
        permissionKey: command.data.permissionKey,
        resourceType: command.data.resourceType,
        resourceId: command.data.resourceId,
        grantedBy: command.userId,
        reason: command.data.reason,
        expiresAt: new Date(Date.now() + command.data.expiresInHours * 60 * 60 * 1000),
      },
    });

    const type: AuditEventType = 'TEMPORARY_PERMISSION_GRANTED';
    await this.prisma.auditEvent.create({
      data: {
        userId: command.userId,
        type,
        ipAddress: '0.0.0.0',
        userAgent: 'api',
        metadata: { organizationId: command.organizationId, targetUserId: command.data.userId, permissionKey: command.data.permissionKey },
      },
    });

    return toTemporaryPermissionDto(created);
  }
}

export class RevokeTemporaryPermissionCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly temporaryPermissionId: string,
  ) {}
}

@CommandHandler(RevokeTemporaryPermissionCommand)
export class RevokeTemporaryPermissionHandler
  implements ICommandHandler<RevokeTemporaryPermissionCommand, void>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: RevokeTemporaryPermissionCommand): Promise<void> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'SECURITY_MANAGER');

    const existing = await this.prisma.temporaryPermission.findFirst({
      where: { id: command.temporaryPermissionId, organizationId: command.organizationId },
    });
    if (!existing) {
      throw new AppException('TEMPORARY_PERMISSION_NOT_FOUND', 'Temporary permission not found.', HttpStatus.NOT_FOUND);
    }
    await this.prisma.temporaryPermission.update({
      where: { id: command.temporaryPermissionId },
      data: { revokedAt: new Date() },
    });

    const type: AuditEventType = 'TEMPORARY_PERMISSION_REVOKED';
    await this.prisma.auditEvent.create({
      data: {
        userId: command.userId,
        type,
        ipAddress: '0.0.0.0',
        userAgent: 'api',
        metadata: { organizationId: command.organizationId, temporaryPermissionId: command.temporaryPermissionId },
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Approval workflows / requests
// ---------------------------------------------------------------------------

export class CreateApprovalWorkflowCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly data: CreateApprovalWorkflowRequestDto,
  ) {}
}

@CommandHandler(CreateApprovalWorkflowCommand)
export class CreateApprovalWorkflowHandler
  implements ICommandHandler<CreateApprovalWorkflowCommand, ApprovalWorkflowDto>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CreateApprovalWorkflowCommand): Promise<ApprovalWorkflowDto> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'ADMIN');

    const created = await this.prisma.approvalWorkflow.create({
      data: {
        organizationId: command.organizationId,
        name: command.data.name,
        resourceType: command.data.resourceType,
        requiredApprovals: command.data.requiredApprovals ?? 1,
        approverRole: command.data.approverRole,
      },
    });
    return toApprovalWorkflowDto(created);
  }
}

export class CreateApprovalRequestCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly data: CreateApprovalRequestRequestDto,
  ) {}
}

@CommandHandler(CreateApprovalRequestCommand)
export class CreateApprovalRequestHandler
  implements ICommandHandler<CreateApprovalRequestCommand, ApprovalRequestDto>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CreateApprovalRequestCommand): Promise<ApprovalRequestDto> {
    await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);

    const workflow = await this.prisma.approvalWorkflow.findFirst({
      where: { id: command.data.workflowId, organizationId: command.organizationId, enabled: true },
    });
    if (!workflow) {
      throw new AppException('APPROVAL_WORKFLOW_NOT_FOUND', 'Approval workflow not found.', HttpStatus.NOT_FOUND);
    }

    const created = await this.prisma.approvalRequest.create({
      data: {
        workflowId: workflow.id,
        organizationId: command.organizationId,
        requestedBy: command.userId,
        resourceType: command.data.resourceType,
        resourceId: command.data.resourceId,
        reason: command.data.reason,
      },
    });
    return toApprovalRequestDto(created);
  }
}

export class DecideApprovalRequestCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly approvalRequestId: string,
    public readonly data: DecideApprovalRequestRequestDto,
  ) {}
}

@CommandHandler(DecideApprovalRequestCommand)
export class DecideApprovalRequestHandler
  implements ICommandHandler<DecideApprovalRequestCommand, ApprovalRequestDto>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: DecideApprovalRequestCommand): Promise<ApprovalRequestDto> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);

    const request = await this.prisma.approvalRequest.findFirst({
      where: { id: command.approvalRequestId, organizationId: command.organizationId },
      include: { workflow: true },
    });
    if (!request) {
      throw new AppException('APPROVAL_REQUEST_NOT_FOUND', 'Approval request not found.', HttpStatus.NOT_FOUND);
    }
    if (request.status !== 'PENDING') {
      throw new AppException('APPROVAL_REQUEST_ALREADY_DECIDED', 'This request has already been decided.', HttpStatus.CONFLICT);
    }
    requireEnterpriseRole(role, request.workflow.approverRole);

    const updated = await this.prisma.approvalRequest.update({
      where: { id: request.id },
      data: {
        status: command.data.approve ? 'APPROVED' : 'REJECTED',
        decidedBy: command.userId,
        decisionNote: command.data.decisionNote,
        decidedAt: new Date(),
      },
    });

    const type: AuditEventType = 'APPROVAL_REQUEST_DECIDED';
    await this.prisma.auditEvent.create({
      data: {
        userId: command.userId,
        type,
        ipAddress: '0.0.0.0',
        userAgent: 'api',
        metadata: { organizationId: command.organizationId, approvalRequestId: request.id, approved: command.data.approve },
      },
    });

    return toApprovalRequestDto(updated);
  }
}
