import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Throttle } from '@nestjs/throttler';
import type { ScriptDefinitionDto, ScriptExecutionDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import {
  CreateScriptDefinitionDto,
  ListScriptExecutionsQueryParamsDto,
  RunScriptDto,
  UpdateScriptDefinitionDto,
} from '../dto/scripts.dto.js';
import {
  CreateScriptDefinitionCommand,
  DeleteScriptDefinitionCommand,
  RunScriptCommand,
  UpdateScriptDefinitionCommand,
} from '../commands/scripts.commands.js';
import {
  GetScriptDefinitionQuery,
  GetScriptExecutionQuery,
  ListScriptDefinitionsQuery,
  ListScriptExecutionsQuery,
} from '../queries/scripts.queries.js';

/// Module 13 — Script Engine (task #286). Workspace-scoped (no
/// `:organizationId`, same personal-workspace resolution every other
/// Module 13 controller uses) — a script belongs to the caller's
/// workspace, run against the caller's own data through the same
/// permission-gated `pentesthub.*` sandbox API `ScriptEngineService`
/// documents.
@ApiTags('scripts')
@ApiBearerAuth()
@Controller('scripts')
export class ScriptsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List scripts in the caller\'s workspace' })
  list(@CurrentUser() user: RequestUser): Promise<ScriptDefinitionDto[]> {
    return this.queryBus.execute(new ListScriptDefinitionsQuery(user.id));
  }

  @Post()
  @ApiOperation({ summary: 'Create a new script' })
  create(@Body() dto: CreateScriptDefinitionDto, @CurrentUser() user: RequestUser): Promise<ScriptDefinitionDto> {
    return this.commandBus.execute(new CreateScriptDefinitionCommand(user.id, dto));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a script' })
  get(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<ScriptDefinitionDto> {
    return this.queryBus.execute(new GetScriptDefinitionQuery(user.id, id));
  }

  @Post(':id')
  @ApiOperation({ summary: 'Update a script' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateScriptDefinitionDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ScriptDefinitionDto> {
    return this.commandBus.execute(new UpdateScriptDefinitionCommand(user.id, id, dto));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a script' })
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<{ deleted: true }> {
    await this.commandBus.execute(new DeleteScriptDefinitionCommand(user.id, id));
    return { deleted: true };
  }

  @Post(':id/run')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Run a script inside the node:vm sandbox and wait for the result' })
  run(
    @Param('id') id: string,
    @Body() dto: RunScriptDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ScriptExecutionDto> {
    return this.commandBus.execute(new RunScriptCommand(user.id, id, dto));
  }

  @Get(':id/executions')
  @ApiOperation({ summary: 'List past executions of a script' })
  listExecutions(
    @Param('id') id: string,
    @Query() query: ListScriptExecutionsQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ScriptExecutionDto[]> {
    return this.queryBus.execute(new ListScriptExecutionsQuery(user.id, id, query));
  }

  @Get(':id/executions/:executionId')
  @ApiOperation({ summary: 'Get a single script execution' })
  getExecution(
    @Param('id') id: string,
    @Param('executionId') executionId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ScriptExecutionDto> {
    return this.queryBus.execute(new GetScriptExecutionQuery(user.id, id, executionId));
  }
}
