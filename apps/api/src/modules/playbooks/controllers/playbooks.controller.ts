import { Body, Controller, Get, HttpStatus, Inject, Param, Post, Query } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { PlaybookDto, PlaybookDryRunResultDto, PlaybookExecutionDto, PlaybookValidationResultDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import {
  CreatePlaybookDto,
  ListPlaybooksQueryParamsDto,
  StartPlaybookExecutionDto,
  UpdatePlaybookDraftDto,
} from '../dto/playbook.dto.js';
import {
  ArchivePlaybookCommand,
  ClonePlaybookCommand,
  CreatePlaybookCommand,
  PublishPlaybookCommand,
  UpdatePlaybookDraftCommand,
} from '../commands/playbook-lifecycle.commands.js';
import { GetPlaybookQuery, ListPlaybooksQuery } from '../queries/playbook.queries.js';
import { ListPlaybookExecutionsQuery } from '../queries/playbook-execution.queries.js';
import { PlaybookValidationService } from '../playbook-validation.service.js';
import { PlaybookExecutionService } from '../playbook-execution.service.js';
import { PLAYBOOKS_REPOSITORY, type PlaybooksRepository } from '../domain/repositories/playbooks.repository.interface.js';
import { WORKSPACES_REPOSITORY, type WorkspacesRepository } from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import { AppException } from '../../../common/exceptions/app.exception.js';

/// Module 16 — Playbooks + Playbook Builder (task #389). CRUD lifecycle
/// (create/update/publish/clone/archive) runs through CQRS commands
/// (playbook-lifecycle.commands.ts), matching the platform convention.
/// Validate/dry-run/run are *not* CQRS commands — they delegate directly
/// to PlaybookValidationService/PlaybookExecutionService, the same
/// "service injected directly into the controller" pattern
/// AdHocCommandService uses for Terminal, since these are read-heavy or
/// execution-engine operations rather than simple CRUD writes.
@ApiTags('playbooks')
@ApiBearerAuth()
@Controller('playbooks')
export class PlaybooksController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly validation: PlaybookValidationService,
    private readonly executionService: PlaybookExecutionService,
    @Inject(PLAYBOOKS_REPOSITORY) private readonly playbooksRepository: PlaybooksRepository,
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List playbooks in the caller workspace' })
  list(@Query() query: ListPlaybooksQueryParamsDto, @CurrentUser() user: RequestUser): Promise<PlaybookDto[]> {
    return this.queryBus.execute(new ListPlaybooksQuery(user.id, query));
  }

  @Post()
  @ApiOperation({ summary: 'Create a new playbook draft (version 1)' })
  create(@Body() dto: CreatePlaybookDto, @CurrentUser() user: RequestUser): Promise<PlaybookDto> {
    return this.commandBus.execute(new CreatePlaybookCommand(user.id, dto));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a playbook and its current/latest version' })
  get(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.queryBus.execute(new GetPlaybookQuery(user.id, id));
  }

  @Post(':id')
  @ApiOperation({ summary: 'Update a playbook draft (creates a new unpublished version if graph/variables change)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePlaybookDraftDto,
    @CurrentUser() user: RequestUser,
  ): Promise<PlaybookDto> {
    return this.commandBus.execute(new UpdatePlaybookDraftCommand(user.id, id, dto));
  }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Validate and publish the latest draft version' })
  publish(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<PlaybookDto> {
    return this.commandBus.execute(new PublishPlaybookCommand(user.id, id));
  }

  @Post(':id/clone')
  @ApiOperation({ summary: 'Clone a playbook into a new draft owned by the caller workspace' })
  clone(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<PlaybookDto> {
    return this.commandBus.execute(new ClonePlaybookCommand(user.id, id));
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Archive a playbook (no longer executable)' })
  archive(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<PlaybookDto> {
    return this.commandBus.execute(new ArchivePlaybookCommand(user.id, id));
  }

  @Post(':id/validate')
  @ApiOperation({ summary: 'Run PlaybookValidationService against the latest draft version without publishing' })
  async validate(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<PlaybookValidationResultDto> {
    const workspace = await this.workspacesRepository.findPersonalWorkspaceForUser(user.id);
    if (!workspace) throw new AppException('WORKSPACE_NOT_FOUND', 'Workspace not found.', HttpStatus.NOT_FOUND);
    const playbook = await this.playbooksRepository.findByIdForWorkspace(id, workspace.id);
    if (!playbook) throw new AppException('PLAYBOOK_NOT_FOUND', 'Playbook not found.', HttpStatus.NOT_FOUND);
    const latest = await this.playbooksRepository.findLatestVersion(playbook.id);
    if (!latest) throw new AppException('PLAYBOOK_VERSION_NOT_FOUND', 'Playbook has no version.', HttpStatus.NOT_FOUND);
    return this.validation.validate(latest.graph as never);
  }

  @Post(':id/dry-run')
  @ApiOperation({ summary: 'Preview a playbook run against a target without executing any tool, modifying findings, or sending notifications' })
  dryRun(
    @Param('id') id: string,
    @Body() dto: StartPlaybookExecutionDto,
    @CurrentUser() user: RequestUser,
  ): Promise<PlaybookDryRunResultDto> {
    return this.executionService.dryRun(user.id, id, dto);
  }

  @Post(':id/run')
  @ApiOperation({ summary: 'Start a real playbook execution against a target' })
  run(
    @Param('id') id: string,
    @Body() dto: StartPlaybookExecutionDto,
    @CurrentUser() user: RequestUser,
  ): Promise<PlaybookExecutionDto> {
    return this.executionService.start(user.id, id, dto);
  }

  @Get(':id/executions')
  @ApiOperation({ summary: 'List executions of this playbook in the caller workspace' })
  executions(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<PlaybookExecutionDto[]> {
    return this.queryBus.execute(new ListPlaybookExecutionsQuery(user.id, id));
  }
}
