import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type {
  AcceptOrganizationInviteRequestDto,
  BillingWebhookEventDto,
  CreateOrganizationInviteRequestDto,
  CreateOrganizationRequestDto,
  OrganizationDto,
  OrganizationInviteDto,
  OrganizationSettingsDto,
  ResourceQuotaDto,
  UpdateOrganizationRequestDto,
  UpdateOrganizationSettingsRequestDto,
  UpdateOrganizationMemberRoleRequestDto,
  UpdateResourceQuotaRequestDto,
  UpdateTenantBillingRequestDto,
  UpdateTenantBrandingRequestDto,
} from '@pentesthub/shared';
import type { AuditEventType } from '../../../prisma-types.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveOrganizationMembership } from '../organization-membership.util.js';
import { requireCanGrantEnterpriseRole, requireEnterpriseRole } from '../enterprise-permissions.util.js';
import { checkQuota } from '../quota-enforcement.util.js';
import {
  toOrganizationDto,
  toOrganizationInviteDto,
  toOrganizationSettingsDto,
  toResourceQuotaDto,
} from '../mappers/to-enterprise-dto.mapper.js';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

// ---------------------------------------------------------------------------
// Create / update organization
// ---------------------------------------------------------------------------

export class CreateOrganizationCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: CreateOrganizationRequestDto,
  ) {}
}

@CommandHandler(CreateOrganizationCommand)
export class CreateOrganizationHandler implements ICommandHandler<CreateOrganizationCommand, OrganizationDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CreateOrganizationCommand): Promise<OrganizationDto> {
    const slug = slugify(command.data.slug || command.data.name);
    const existing = await this.prisma.organization.findUnique({ where: { slug } });
    if (existing) {
      throw new AppException('ORGANIZATION_SLUG_ALREADY_EXISTS', 'Slug already in use.', HttpStatus.CONFLICT);
    }

    const [organization] = await this.prisma.$transaction([
      this.prisma.organization.create({
        data: {
          name: command.data.name,
          slug,
          domain: command.data.domain,
          logoUrl: command.data.logoUrl,
          createdBy: command.userId,
        },
      }),
    ]);
    // The creator is always seated as ORG_OWNER — the enterprise-role
    // analogue of Module 1's "creator becomes the personal workspace's
    // OWNER" rule.
    await this.prisma.organizationMember.create({
      data: { organizationId: organization.id, userId: command.userId, role: 'ORG_OWNER' },
    });

    const type: AuditEventType = 'ORGANIZATION_CREATED';
    await this.prisma.auditEvent.create({
      data: {
        userId: command.userId,
        type,
        ipAddress: '0.0.0.0',
        userAgent: 'api',
        metadata: { organizationId: organization.id, name: organization.name },
      },
    });

    return toOrganizationDto(organization);
  }
}

export class UpdateOrganizationCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly data: UpdateOrganizationRequestDto,
  ) {}
}

@CommandHandler(UpdateOrganizationCommand)
export class UpdateOrganizationHandler implements ICommandHandler<UpdateOrganizationCommand, OrganizationDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpdateOrganizationCommand): Promise<OrganizationDto> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'ORG_OWNER');

    const organization = await this.prisma.organization.update({
      where: { id: command.organizationId },
      data: {
        name: command.data.name,
        domain: command.data.domain,
        logoUrl: command.data.logoUrl,
        plan: command.data.plan,
        status: command.data.status,
      },
    });
    return toOrganizationDto(organization);
  }
}

// ---------------------------------------------------------------------------
// Settings / quota
// ---------------------------------------------------------------------------

export class UpdateOrganizationSettingsCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly data: UpdateOrganizationSettingsRequestDto,
  ) {}
}

@CommandHandler(UpdateOrganizationSettingsCommand)
export class UpdateOrganizationSettingsHandler
  implements ICommandHandler<UpdateOrganizationSettingsCommand, OrganizationSettingsDto>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpdateOrganizationSettingsCommand): Promise<OrganizationSettingsDto> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'ORG_OWNER');

    const settings = await this.prisma.organizationSettings.upsert({
      where: { organizationId: command.organizationId },
      create: {
        organizationId: command.organizationId,
        enforceMfa: command.data.enforceMfa ?? false,
        allowedEmailDomains: command.data.allowedEmailDomains ?? [],
        defaultMemberRole: command.data.defaultMemberRole ?? 'VIEWER',
        sessionTimeoutMinutes: command.data.sessionTimeoutMinutes,
        dataResidency: command.data.dataResidency,
      },
      update: {
        enforceMfa: command.data.enforceMfa,
        allowedEmailDomains: command.data.allowedEmailDomains,
        defaultMemberRole: command.data.defaultMemberRole,
        sessionTimeoutMinutes: command.data.sessionTimeoutMinutes,
        dataResidency: command.data.dataResidency,
      },
    });
    return toOrganizationSettingsDto(settings);
  }
}

/// Quota limits are set by SUPER_ADMIN only in a real deployment (billing-
/// tier driven), but this codebase has no platform-operator console yet —
/// ORG_OWNER can self-manage quota for now, same disclosed-scope pattern
/// as everything else lacking a dedicated admin surface. A future module
/// can lock this down to a platform-operator role once one exists.
export class UpdateResourceQuotaCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly data: UpdateResourceQuotaRequestDto,
  ) {}
}

@CommandHandler(UpdateResourceQuotaCommand)
export class UpdateResourceQuotaHandler
  implements ICommandHandler<UpdateResourceQuotaCommand, ResourceQuotaDto>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpdateResourceQuotaCommand): Promise<ResourceQuotaDto> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'ORG_OWNER');

    const quota = await this.prisma.resourceQuota.upsert({
      where: { organizationId: command.organizationId },
      create: { organizationId: command.organizationId, ...command.data },
      update: { ...command.data },
    });
    return toResourceQuotaDto(quota);
  }
}

// ---------------------------------------------------------------------------
// Tenant Management (Module 14, Enterprise Edition only)
// ---------------------------------------------------------------------------

/// Gated by `@RequiresEdition('enterprise')` at the controller layer, not
/// here — this handler itself doesn't re-check edition, matching every
/// other command in this file (the guard is the single point of
/// enforcement, not duplicated per-handler).
export class UpdateTenantBillingCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly data: UpdateTenantBillingRequestDto,
  ) {}
}

@CommandHandler(UpdateTenantBillingCommand)
export class UpdateTenantBillingHandler implements ICommandHandler<UpdateTenantBillingCommand, OrganizationDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpdateTenantBillingCommand): Promise<OrganizationDto> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'ORG_OWNER');

    const organization = await this.prisma.organization.update({
      where: { id: command.organizationId },
      data: { billingEmail: command.data.billingEmail },
    });
    return toOrganizationDto(organization);
  }
}

export class UpdateTenantBrandingCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly data: UpdateTenantBrandingRequestDto,
  ) {}
}

@CommandHandler(UpdateTenantBrandingCommand)
export class UpdateTenantBrandingHandler implements ICommandHandler<UpdateTenantBrandingCommand, OrganizationDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpdateTenantBrandingCommand): Promise<OrganizationDto> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'ORG_OWNER');

    // `customDomainVerifiedAt` is deliberately untouched here — setting a
    // new `customDomain` does not itself prove the operator controls that
    // domain. This codebase has no DNS-TXT-record verification flow yet
    // (that's an infrastructure-level check, similar in spirit to
    // Certificate rotation's ACME HTTP-01 challenge — see
    // docs/security/tls-mtls-certificates.md), so `customDomainVerifiedAt`
    // stays `null` until a future pass adds one; branding colors/favicon
    // carry no such trust requirement and apply immediately.
    const organization = await this.prisma.organization.update({
      where: { id: command.organizationId },
      data: {
        customDomain: command.data.customDomain,
        brandingPrimaryColor: command.data.brandingPrimaryColor,
        brandingFaviconUrl: command.data.brandingFaviconUrl,
      },
    });
    return toOrganizationDto(organization);
  }
}

/// Module 14 — Tenant Management / Billing Hooks. Authorization for this
/// command is the caller's job (`BillingWebhookController`'s shared-secret
/// check), not this handler's — by the time this executes, the request
/// is already trusted. Looks the organization up by
/// `billingProviderCustomerId` (set once via `UpdateTenantBillingCommand`
/// or an initial provisioning step outside this codebase) rather than by
/// `organizationId`, since the billing provider only knows its own
/// customer ID, not this platform's internal IDs.
export class HandleBillingWebhookCommand implements ICommand {
  constructor(public readonly event: BillingWebhookEventDto) {}
}

@CommandHandler(HandleBillingWebhookCommand)
export class HandleBillingWebhookHandler implements ICommandHandler<HandleBillingWebhookCommand, void> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: HandleBillingWebhookCommand): Promise<void> {
    const { event } = command;
    const organization = await this.prisma.organization.findFirst({
      where: { billingProviderCustomerId: event.billingProviderCustomerId },
    });
    if (!organization) {
      // Not an error worth surfacing to the billing provider as a
      // delivery failure (that would trigger their own retry/alerting) —
      // a customer ID this platform doesn't recognize (e.g. a test event,
      // or a customer created before `billingProviderCustomerId` was
      // ever set on the corresponding organization) is a no-op, not a
      // fault.
      return;
    }

    const subscriptionStatus =
      event.type === 'SUBSCRIPTION_CANCELLED'
        ? 'cancelled'
        : event.type === 'PAYMENT_FAILED'
          ? 'past_due'
          : (event.subscriptionStatus ?? organization.subscriptionStatus);

    await this.prisma.organization.update({
      where: { id: organization.id },
      data: {
        subscriptionStatus,
        subscriptionRenewsAt: event.subscriptionRenewsAt ? new Date(event.subscriptionRenewsAt) : undefined,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

export class CreateOrganizationInviteCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly data: CreateOrganizationInviteRequestDto,
  ) {}
}

@CommandHandler(CreateOrganizationInviteCommand)
export class CreateOrganizationInviteHandler
  implements ICommandHandler<CreateOrganizationInviteCommand, OrganizationInviteDto>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CreateOrganizationInviteCommand): Promise<OrganizationInviteDto> {
    const { role: actingRole } = await resolveOrganizationMembership(
      this.prisma,
      command.userId,
      command.organizationId,
    );
    requireEnterpriseRole(actingRole, 'ADMIN');
    requireCanGrantEnterpriseRole(actingRole, command.data.role);

    const memberCount = await this.prisma.organizationMember.count({
      where: { organizationId: command.organizationId },
    });
    await checkQuota(this.prisma, command.organizationId, 'maxMembers', memberCount);

    const token = randomBytes(32).toString('base64url');
    const expiresInDays = command.data.expiresInDays ?? 7;
    const invite = await this.prisma.organizationInvite.create({
      data: {
        organizationId: command.organizationId,
        email: command.data.email.toLowerCase().trim(),
        role: command.data.role,
        departmentId: command.data.departmentId,
        teamId: command.data.teamId,
        invitedBy: command.userId,
        token,
        expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
      },
    });

    // No transactional email provider in this codebase yet (same disclosed
    // gap as Module 9's WorkspaceInvite) — fully usable via the returned
    // token / an admin-copied accept link.
    const type: AuditEventType = 'ORGANIZATION_MEMBER_INVITED';
    await this.prisma.auditEvent.create({
      data: {
        userId: command.userId,
        type,
        ipAddress: '0.0.0.0',
        userAgent: 'api',
        metadata: { organizationId: command.organizationId, inviteId: invite.id, email: invite.email, role: invite.role },
      },
    });

    return toOrganizationInviteDto(invite);
  }
}

export class RevokeOrganizationInviteCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly inviteId: string,
  ) {}
}

@CommandHandler(RevokeOrganizationInviteCommand)
export class RevokeOrganizationInviteHandler implements ICommandHandler<RevokeOrganizationInviteCommand, void> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: RevokeOrganizationInviteCommand): Promise<void> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'ADMIN');

    const invite = await this.prisma.organizationInvite.findFirst({
      where: { id: command.inviteId, organizationId: command.organizationId },
    });
    if (!invite) {
      throw new AppException('ORGANIZATION_INVITE_NOT_FOUND', 'Invite not found.', HttpStatus.NOT_FOUND);
    }
    await this.prisma.organizationInvite.update({ where: { id: invite.id }, data: { status: 'REVOKED' } });
  }
}

export class AcceptOrganizationInviteCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly userEmail: string,
    public readonly data: AcceptOrganizationInviteRequestDto,
  ) {}
}

@CommandHandler(AcceptOrganizationInviteCommand)
export class AcceptOrganizationInviteHandler
  implements ICommandHandler<AcceptOrganizationInviteCommand, OrganizationInviteDto>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: AcceptOrganizationInviteCommand): Promise<OrganizationInviteDto> {
    const invite = await this.prisma.organizationInvite.findUnique({ where: { token: command.data.token } });
    if (!invite || invite.status !== 'PENDING') {
      throw new AppException('ORGANIZATION_INVITE_NOT_FOUND', 'Invite not found or already used.', HttpStatus.NOT_FOUND);
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      await this.prisma.organizationInvite.update({ where: { id: invite.id }, data: { status: 'EXPIRED' } });
      throw new AppException('ORGANIZATION_INVITE_EXPIRED', 'This invite has expired.', HttpStatus.GONE);
    }
    if (invite.email !== command.userEmail.toLowerCase().trim()) {
      throw new AppException(
        'ORGANIZATION_INVITE_EMAIL_MISMATCH',
        'This invite was sent to a different email address.',
        HttpStatus.FORBIDDEN,
      );
    }

    const [, updated] = await this.prisma.$transaction([
      this.prisma.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: invite.organizationId, userId: command.userId } },
        create: {
          organizationId: invite.organizationId,
          userId: command.userId,
          role: invite.role,
          departmentId: invite.departmentId,
        },
        update: { role: invite.role, departmentId: invite.departmentId, status: 'ACTIVE' },
      }),
      this.prisma.organizationInvite.update({ where: { id: invite.id }, data: { status: 'ACCEPTED' } }),
    ]);

    if (invite.teamId) {
      const member = await this.prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: invite.organizationId, userId: command.userId } },
      });
      if (member) {
        await this.prisma.teamMember.upsert({
          where: { teamId_organizationMemberId: { teamId: invite.teamId, organizationMemberId: member.id } },
          create: { teamId: invite.teamId, organizationMemberId: member.id },
          update: {},
        });
      }
    }

    return toOrganizationInviteDto(updated);
  }
}

// ---------------------------------------------------------------------------
// Member role / removal
// ---------------------------------------------------------------------------

export class UpdateOrganizationMemberRoleCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly targetUserId: string,
    public readonly data: UpdateOrganizationMemberRoleRequestDto,
  ) {}
}

@CommandHandler(UpdateOrganizationMemberRoleCommand)
export class UpdateOrganizationMemberRoleHandler
  implements ICommandHandler<UpdateOrganizationMemberRoleCommand, void>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpdateOrganizationMemberRoleCommand): Promise<void> {
    const { role: actingRole } = await resolveOrganizationMembership(
      this.prisma,
      command.userId,
      command.organizationId,
    );
    requireEnterpriseRole(actingRole, 'ADMIN');
    requireCanGrantEnterpriseRole(actingRole, command.data.role);

    if (command.data.role !== 'ORG_OWNER') {
      const target = await this.prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: command.organizationId, userId: command.targetUserId } },
      });
      if (target?.role === 'ORG_OWNER') {
        const ownerCount = await this.prisma.organizationMember.count({
          where: { organizationId: command.organizationId, role: 'ORG_OWNER' },
        });
        if (ownerCount <= 1) {
          throw new AppException(
            'ORGANIZATION_MEMBER_CANNOT_DEMOTE_LAST_OWNER',
            "Cannot demote the organization's only remaining Owner.",
            HttpStatus.CONFLICT,
          );
        }
      }
    }

    await this.prisma.organizationMember.update({
      where: { organizationId_userId: { organizationId: command.organizationId, userId: command.targetUserId } },
      data: { role: command.data.role },
    });

    const type: AuditEventType = 'ORGANIZATION_MEMBER_ROLE_CHANGED';
    await this.prisma.auditEvent.create({
      data: {
        userId: command.userId,
        type,
        ipAddress: '0.0.0.0',
        userAgent: 'api',
        metadata: { organizationId: command.organizationId, targetUserId: command.targetUserId, newRole: command.data.role },
      },
    });
  }
}

export class RemoveOrganizationMemberCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly targetUserId: string,
  ) {}
}

@CommandHandler(RemoveOrganizationMemberCommand)
export class RemoveOrganizationMemberHandler implements ICommandHandler<RemoveOrganizationMemberCommand, void> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: RemoveOrganizationMemberCommand): Promise<void> {
    const { role: actingRole } = await resolveOrganizationMembership(
      this.prisma,
      command.userId,
      command.organizationId,
    );
    requireEnterpriseRole(actingRole, 'ADMIN');

    await this.prisma.organizationMember.delete({
      where: { organizationId_userId: { organizationId: command.organizationId, userId: command.targetUserId } },
    });

    const type: AuditEventType = 'ORGANIZATION_MEMBER_REMOVED';
    await this.prisma.auditEvent.create({
      data: {
        userId: command.userId,
        type,
        ipAddress: '0.0.0.0',
        userAgent: 'api',
        metadata: { organizationId: command.organizationId, targetUserId: command.targetUserId },
      },
    });
  }
}
