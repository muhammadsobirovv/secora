import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import type {
  AddTeamMemberRequestDto,
  CreateDepartmentRequestDto,
  CreateTeamRequestDto,
  DepartmentDto,
  TeamDto,
  UpdateDepartmentRequestDto,
  UpdateTeamRequestDto,
} from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveOrganizationMembership } from '../organization-membership.util.js';
import { requireEnterpriseRole } from '../enterprise-permissions.util.js';
import { checkQuota } from '../quota-enforcement.util.js';
import { toDepartmentDto, toTeamDto } from '../mappers/to-enterprise-dto.mapper.js';

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

export class CreateDepartmentCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly data: CreateDepartmentRequestDto,
  ) {}
}

@CommandHandler(CreateDepartmentCommand)
export class CreateDepartmentHandler implements ICommandHandler<CreateDepartmentCommand, DepartmentDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CreateDepartmentCommand): Promise<DepartmentDto> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'ADMIN');

    const department = await this.prisma.department.create({
      data: {
        organizationId: command.organizationId,
        name: command.data.name,
        parentDepartmentId: command.data.parentDepartmentId,
        managerUserId: command.data.managerUserId,
      },
    });
    return toDepartmentDto(department);
  }
}

export class UpdateDepartmentCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly departmentId: string,
    public readonly data: UpdateDepartmentRequestDto,
  ) {}
}

@CommandHandler(UpdateDepartmentCommand)
export class UpdateDepartmentHandler implements ICommandHandler<UpdateDepartmentCommand, DepartmentDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpdateDepartmentCommand): Promise<DepartmentDto> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'ADMIN');

    const existing = await this.prisma.department.findFirst({
      where: { id: command.departmentId, organizationId: command.organizationId },
    });
    if (!existing) {
      throw new AppException('DEPARTMENT_NOT_FOUND', 'Department not found.', HttpStatus.NOT_FOUND);
    }
    const department = await this.prisma.department.update({
      where: { id: command.departmentId },
      data: {
        name: command.data.name,
        parentDepartmentId: command.data.parentDepartmentId,
        managerUserId: command.data.managerUserId,
      },
    });
    return toDepartmentDto(department);
  }
}

export class DeleteDepartmentCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly departmentId: string,
  ) {}
}

@CommandHandler(DeleteDepartmentCommand)
export class DeleteDepartmentHandler implements ICommandHandler<DeleteDepartmentCommand, void> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: DeleteDepartmentCommand): Promise<void> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'ADMIN');

    const existing = await this.prisma.department.findFirst({
      where: { id: command.departmentId, organizationId: command.organizationId },
    });
    if (!existing) {
      throw new AppException('DEPARTMENT_NOT_FOUND', 'Department not found.', HttpStatus.NOT_FOUND);
    }
    // Child departments/members simply lose their parent/department pointer
    // (both are nullable, onDelete: SetNull) rather than cascading — a
    // deleted department never silently deletes people or sub-departments.
    await this.prisma.department.delete({ where: { id: command.departmentId } });
  }
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

export class CreateTeamCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly data: CreateTeamRequestDto,
  ) {}
}

@CommandHandler(CreateTeamCommand)
export class CreateTeamHandler implements ICommandHandler<CreateTeamCommand, TeamDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CreateTeamCommand): Promise<TeamDto> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'TEAM_LEAD');

    const teamCount = await this.prisma.team.count({ where: { organizationId: command.organizationId } });
    await checkQuota(this.prisma, command.organizationId, 'maxTeams', teamCount);

    const team = await this.prisma.team.create({
      data: {
        organizationId: command.organizationId,
        name: command.data.name,
        departmentId: command.data.departmentId,
        parentTeamId: command.data.parentTeamId,
        leadUserId: command.data.leadUserId,
      },
    });
    return toTeamDto(team, 0);
  }
}

export class UpdateTeamCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly teamId: string,
    public readonly data: UpdateTeamRequestDto,
  ) {}
}

@CommandHandler(UpdateTeamCommand)
export class UpdateTeamHandler implements ICommandHandler<UpdateTeamCommand, TeamDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpdateTeamCommand): Promise<TeamDto> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'TEAM_LEAD');

    const existing = await this.prisma.team.findFirst({
      where: { id: command.teamId, organizationId: command.organizationId },
    });
    if (!existing) {
      throw new AppException('TEAM_NOT_FOUND', 'Team not found.', HttpStatus.NOT_FOUND);
    }
    const team = await this.prisma.team.update({
      where: { id: command.teamId },
      data: {
        name: command.data.name,
        departmentId: command.data.departmentId,
        parentTeamId: command.data.parentTeamId,
        leadUserId: command.data.leadUserId,
      },
    });
    const memberCount = await this.prisma.teamMember.count({ where: { teamId: team.id } });
    return toTeamDto(team, memberCount);
  }
}

export class DeleteTeamCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly teamId: string,
  ) {}
}

@CommandHandler(DeleteTeamCommand)
export class DeleteTeamHandler implements ICommandHandler<DeleteTeamCommand, void> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: DeleteTeamCommand): Promise<void> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'ADMIN');

    const existing = await this.prisma.team.findFirst({
      where: { id: command.teamId, organizationId: command.organizationId },
    });
    if (!existing) {
      throw new AppException('TEAM_NOT_FOUND', 'Team not found.', HttpStatus.NOT_FOUND);
    }
    await this.prisma.team.delete({ where: { id: command.teamId } });
  }
}

export class AddTeamMemberCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly teamId: string,
    public readonly data: AddTeamMemberRequestDto,
  ) {}
}

@CommandHandler(AddTeamMemberCommand)
export class AddTeamMemberHandler implements ICommandHandler<AddTeamMemberCommand, void> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: AddTeamMemberCommand): Promise<void> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'TEAM_LEAD');

    const team = await this.prisma.team.findFirst({
      where: { id: command.teamId, organizationId: command.organizationId },
    });
    if (!team) {
      throw new AppException('TEAM_NOT_FOUND', 'Team not found.', HttpStatus.NOT_FOUND);
    }
    const orgMember = await this.prisma.organizationMember.findFirst({
      where: { id: command.data.organizationMemberId, organizationId: command.organizationId },
    });
    if (!orgMember) {
      throw new AppException('ORGANIZATION_MEMBERSHIP_NOT_FOUND', 'Organization member not found.', HttpStatus.NOT_FOUND);
    }
    await this.prisma.teamMember.upsert({
      where: { teamId_organizationMemberId: { teamId: command.teamId, organizationMemberId: orgMember.id } },
      create: { teamId: command.teamId, organizationMemberId: orgMember.id },
      update: {},
    });
  }
}

export class RemoveTeamMemberCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly teamId: string,
    public readonly organizationMemberId: string,
  ) {}
}

@CommandHandler(RemoveTeamMemberCommand)
export class RemoveTeamMemberHandler implements ICommandHandler<RemoveTeamMemberCommand, void> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: RemoveTeamMemberCommand): Promise<void> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'TEAM_LEAD');

    const team = await this.prisma.team.findFirst({
      where: { id: command.teamId, organizationId: command.organizationId },
    });
    if (!team) {
      throw new AppException('TEAM_NOT_FOUND', 'Team not found.', HttpStatus.NOT_FOUND);
    }
    await this.prisma.teamMember.deleteMany({
      where: { teamId: command.teamId, organizationMemberId: command.organizationMemberId },
    });
  }
}
