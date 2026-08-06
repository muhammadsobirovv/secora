import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Throttle } from '@nestjs/throttler';
import type { AgentSdkDefinitionDto, AgentSdkRunDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { ListAgentSdkRunsQueryParamsDto, RegisterAgentSdkDefinitionDto, StartAgentSdkRunDto } from '../dto/agent-sdk.dto.js';
import { RegisterAgentSdkDefinitionCommand, StartAgentSdkRunCommand } from '../commands/agent-sdk.commands.js';
import { GetAgentSdkRunQuery, ListAgentSdkDefinitionsQuery, ListAgentSdkRunsQuery } from '../queries/agent-sdk.queries.js';

/// Module 13 — AI Agent SDK HTTP surface (task #281). `/agent-sdk`
/// mirrors the same JWT-guarded, workspace-scoped shape every other
/// module's controller uses — third-party/programmatic access to the
/// *same* agents goes through MCP tools instead (there is no
/// `agent_sdk_*` MCP tool; running a built-in agent via MCP is just
/// `ask_ai` today — a dedicated `run_agent` MCP tool is a natural
/// follow-up once CUSTOM agent execution ships, see
/// `AgentSdkRunnerService`'s doc comment).
@ApiTags('agent-sdk')
@ApiBearerAuth()
@Controller('agent-sdk')
export class AgentSdkController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get('definitions')
  @ApiOperation({ summary: 'List available agent definitions (built-in + this workspace\'s custom agents)' })
  listDefinitions(@CurrentUser() user: RequestUser): Promise<AgentSdkDefinitionDto[]> {
    return this.queryBus.execute(new ListAgentSdkDefinitionsQuery(user.id));
  }

  @Post('definitions')
  @ApiOperation({ summary: 'Register a custom agent definition' })
  registerDefinition(
    @Body() dto: RegisterAgentSdkDefinitionDto,
    @CurrentUser() user: RequestUser,
  ): Promise<AgentSdkDefinitionDto> {
    return this.commandBus.execute(new RegisterAgentSdkDefinitionCommand(user.id, dto));
  }

  @Post('runs')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Start an agent run (synchronous — the response includes the finished run)' })
  startRun(@Body() dto: StartAgentSdkRunDto, @CurrentUser() user: RequestUser): Promise<AgentSdkRunDto> {
    return this.commandBus.execute(new StartAgentSdkRunCommand(user.id, dto));
  }

  @Get('runs')
  @ApiOperation({ summary: 'List past agent runs' })
  listRuns(
    @Query() query: ListAgentSdkRunsQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<AgentSdkRunDto[]> {
    return this.queryBus.execute(
      new ListAgentSdkRunsQuery(user.id, {
        agentSdkDefinitionId: query.agentSdkDefinitionId,
        status: query.status,
        limit: query.limit,
      }),
    );
  }

  @Get('runs/:runId')
  @ApiOperation({ summary: 'Get one agent run' })
  getRun(@Param('runId') runId: string, @CurrentUser() user: RequestUser): Promise<AgentSdkRunDto> {
    return this.queryBus.execute(new GetAgentSdkRunQuery(user.id, runId));
  }
}
