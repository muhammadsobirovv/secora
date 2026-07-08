import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { ProjectDto, ProjectMemberDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { CreateProjectDto } from '../dto/create-project.dto.js';
import { UpdateProjectDto } from '../dto/update-project.dto.js';
import { AddProjectMemberDto } from '../dto/add-project-member.dto.js';
import { ListProjectsQueryParamsDto } from '../dto/list-projects-query.dto.js';
import { CreateProjectCommand } from '../commands/create-project.command.js';
import { UpdateProjectCommand } from '../commands/update-project.command.js';
import {
  ArchiveProjectCommand,
  DeleteProjectCommand,
  FavoriteProjectCommand,
  RestoreProjectCommand,
  UnfavoriteProjectCommand,
} from '../commands/project-lifecycle.commands.js';
import {
  AddProjectMemberCommand,
  RemoveProjectMemberCommand,
} from '../commands/project-members.commands.js';
import {
  TagProjectCommand,
  UntagProjectCommand,
} from '../commands/project-tags.commands.js';
import { GetProjectQuery } from '../queries/get-project.query.js';
import { ListProjectsQuery } from '../queries/list-projects.query.js';
import { ListProjectMembersQuery } from '../queries/list-project-members.query.js';

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List projects in the current workspace' })
  list(
    @Query() filter: ListProjectsQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ProjectDto[]> {
    return this.queryBus.execute(new ListProjectsQuery(user.id, filter));
  }

  @Post()
  @ApiOperation({ summary: 'Create a project' })
  create(
    @Body() dto: CreateProjectDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ProjectDto> {
    return this.commandBus.execute(new CreateProjectCommand(user.id, dto));
  }

  @Get(':projectId')
  @ApiOperation({ summary: 'Get a project' })
  get(
    @Param('projectId') projectId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ProjectDto> {
    return this.queryBus.execute(new GetProjectQuery(user.id, projectId));
  }

  @Patch(':projectId')
  @ApiOperation({ summary: 'Update a project' })
  update(
    @Param('projectId') projectId: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ProjectDto> {
    return this.commandBus.execute(
      new UpdateProjectCommand(user.id, projectId, dto),
    );
  }

  @Delete(':projectId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a project' })
  delete(
    @Param('projectId') projectId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    return this.commandBus.execute(
      new DeleteProjectCommand(user.id, projectId),
    );
  }

  @Post(':projectId/archive')
  @ApiOperation({ summary: 'Archive a project' })
  archive(
    @Param('projectId') projectId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ProjectDto> {
    return this.commandBus.execute(
      new ArchiveProjectCommand(user.id, projectId),
    );
  }

  @Post(':projectId/restore')
  @ApiOperation({ summary: 'Restore a soft-deleted project' })
  restore(
    @Param('projectId') projectId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ProjectDto> {
    return this.commandBus.execute(
      new RestoreProjectCommand(user.id, projectId),
    );
  }

  @Post(':projectId/favorite')
  @ApiOperation({ summary: 'Favorite a project' })
  favorite(
    @Param('projectId') projectId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ProjectDto> {
    return this.commandBus.execute(
      new FavoriteProjectCommand(user.id, projectId),
    );
  }

  @Delete(':projectId/favorite')
  @ApiOperation({ summary: 'Unfavorite a project' })
  unfavorite(
    @Param('projectId') projectId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ProjectDto> {
    return this.commandBus.execute(
      new UnfavoriteProjectCommand(user.id, projectId),
    );
  }

  @Get(':projectId/members')
  @ApiOperation({ summary: 'List project members' })
  listMembers(
    @Param('projectId') projectId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ProjectMemberDto[]> {
    return this.queryBus.execute(
      new ListProjectMembersQuery(user.id, projectId),
    );
  }

  @Post(':projectId/members')
  @ApiOperation({ summary: 'Add a project member' })
  addMember(
    @Param('projectId') projectId: string,
    @Body() dto: AddProjectMemberDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ProjectMemberDto> {
    return this.commandBus.execute(
      new AddProjectMemberCommand(user.id, projectId, dto.userId, dto.role),
    );
  }

  @Delete(':projectId/members/:memberUserId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a project member' })
  removeMember(
    @Param('projectId') projectId: string,
    @Param('memberUserId') memberUserId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    return this.commandBus.execute(
      new RemoveProjectMemberCommand(user.id, projectId, memberUserId),
    );
  }

  @Post(':projectId/tags/:tagId')
  @ApiOperation({ summary: 'Tag a project' })
  tag(
    @Param('projectId') projectId: string,
    @Param('tagId') tagId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    return this.commandBus.execute(
      new TagProjectCommand(user.id, projectId, tagId),
    );
  }

  @Delete(':projectId/tags/:tagId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Untag a project' })
  untag(
    @Param('projectId') projectId: string,
    @Param('tagId') tagId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    return this.commandBus.execute(
      new UntagProjectCommand(user.id, projectId, tagId),
    );
  }
}
