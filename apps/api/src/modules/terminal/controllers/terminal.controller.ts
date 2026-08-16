import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AdHocCommandDto, TerminalCommandDefinitionDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { AdHocCommandService } from '../ad-hoc-command.service.js';
import { ListAdHocCommandsQueryParamsDto, RunAdHocCommandDto } from '../dto/run-adhoc-command.dto.js';
import { listTerminalCommandDefinitions, resolveTerminalCommandClassification } from '../command-registry.js';

/// Module 16 — Terminal workspace + safe command execution (task #388).
/// Every mutating route delegates immediately to `AdHocCommandService` —
/// this controller does no gating of its own beyond DTO validation and
/// pulling `userId` off the authenticated request, matching the platform
/// convention that authorization decisions live in the service/command
/// layer, not the controller. `X-Terminal-Source` is advisory metadata
/// (see AdHocCommandService's doc comment) — the CLI/Desktop integrations
/// set it to `CLI`/`DESKTOP`; a plain browser call defaults to `WEB`/`API`.
/// It is never used for any authorization decision.
@ApiTags('terminal')
@ApiBearerAuth()
@Controller('terminal')
export class TerminalController {
  constructor(private readonly adHocCommandService: AdHocCommandService) {}

  @Get('command-registry')
  @ApiOperation({ summary: 'List the Terminal command registry (SAFE/REQUIRES_APPROVAL commands only — BLOCKED entries are never listed)' })
  listRegistry(): TerminalCommandDefinitionDto[] {
    return listTerminalCommandDefinitions().map((def) => ({
      name: def.name,
      description: def.description,
      kind: def.kind,
      allowedTargetTypes: def.allowedTargetTypes,
      requiredPermissions: def.requiredPermissions,
      riskLevel: def.riskLevel,
      requiresApproval: def.requiresApproval,
      timeoutSeconds: def.timeoutSeconds,
      classification: resolveTerminalCommandClassification(def.name).classification,
    }));
  }

  @Post('commands')
  @ApiOperation({ summary: 'Run (or request approval for) a Terminal command against a target' })
  run(
    @Body() dto: RunAdHocCommandDto,
    @CurrentUser() user: RequestUser,
    @Headers('x-terminal-source') source?: string,
  ): Promise<AdHocCommandDto> {
    return this.adHocCommandService.execute(user.id, dto, source);
  }

  @Get('commands')
  @ApiOperation({ summary: "List the caller's own Terminal command history in their workspace" })
  history(
    @Query() query: ListAdHocCommandsQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<AdHocCommandDto[]> {
    return this.adHocCommandService.listHistory(user.id, query);
  }

  @Get('commands/:id')
  @ApiOperation({ summary: 'Get a Terminal command (own workspace + own commands only)' })
  get(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<AdHocCommandDto> {
    return this.adHocCommandService.getOne(user.id, id);
  }
}
