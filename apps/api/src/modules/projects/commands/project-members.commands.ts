import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import type { ProjectMemberDto, ProjectMemberRole } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  PROJECTS_REPOSITORY,
  type ProjectsRepository,
} from '../domain/repositories/projects.repository.interface.js';
import {
  PROJECT_MEMBERS_REPOSITORY,
  type ProjectMembersRepository,
} from '../domain/repositories/project-members.repository.interface.js';
import { ProjectMemberAddedEvent } from '../events/project-events.js';

export class AddProjectMemberCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly projectId: string,
    public readonly memberUserId: string,
    public readonly role: ProjectMemberRole = 'CONTRIBUTOR',
  ) {}
}

@CommandHandler(AddProjectMemberCommand)
export class AddProjectMemberHandler implements ICommandHandler<
  AddProjectMemberCommand,
  ProjectMemberDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    @Inject(PROJECT_MEMBERS_REPOSITORY)
    private readonly projectMembersRepository: ProjectMembersRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: AddProjectMemberCommand): Promise<ProjectMemberDto> {
    const workspace =
      await this.workspacesRepository.findPersonalWorkspaceForUser(
        command.userId,
      );
    if (!workspace) {
      throw new AppException(
        'WORKSPACE_NOT_FOUND',
        'Workspace not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    const project = await this.projectsRepository.findByIdForWorkspace(
      command.projectId,
      workspace.id,
    );
    if (!project) {
      throw new AppException(
        'PROJECT_NOT_FOUND',
        'Project not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    const isWorkspaceMember = await this.workspacesRepository.isMember(
      workspace.id,
      command.memberUserId,
    );
    if (!isWorkspaceMember) {
      throw new AppException(
        'INVALID_REFERENCE',
        'User is not a member of this workspace.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const existing = await this.projectMembersRepository.findByProjectAndUser(
      command.projectId,
      command.memberUserId,
    );
    if (existing) {
      throw new AppException(
        'PROJECT_MEMBER_ALREADY_EXISTS',
        'User is already a member of this project.',
        HttpStatus.CONFLICT,
      );
    }

    const member = await this.projectMembersRepository.add(
      command.projectId,
      command.memberUserId,
      command.role,
    );

    this.eventBus.publish(
      new ProjectMemberAddedEvent(
        workspace.id,
        command.projectId,
        command.userId,
        {
          memberUserId: command.memberUserId,
        },
      ),
    );

    return {
      userId: member.userId,
      role: member.role,
      addedAt: member.addedAt.toISOString(),
    };
  }
}

export class RemoveProjectMemberCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly projectId: string,
    public readonly memberUserId: string,
  ) {}
}

@CommandHandler(RemoveProjectMemberCommand)
export class RemoveProjectMemberHandler implements ICommandHandler<
  RemoveProjectMemberCommand,
  void
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    @Inject(PROJECT_MEMBERS_REPOSITORY)
    private readonly projectMembersRepository: ProjectMembersRepository,
  ) {}

  async execute(command: RemoveProjectMemberCommand): Promise<void> {
    const workspace =
      await this.workspacesRepository.findPersonalWorkspaceForUser(
        command.userId,
      );
    if (!workspace) {
      throw new AppException(
        'WORKSPACE_NOT_FOUND',
        'Workspace not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    const project = await this.projectsRepository.findByIdForWorkspace(
      command.projectId,
      workspace.id,
    );
    if (!project) {
      throw new AppException(
        'PROJECT_NOT_FOUND',
        'Project not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.projectMembersRepository.remove(
      command.projectId,
      command.memberUserId,
    );
  }
}
