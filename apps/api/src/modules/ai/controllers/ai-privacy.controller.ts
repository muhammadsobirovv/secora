import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { WorkspaceAiPrivacySettingDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { UpdateWorkspaceAiPrivacyModeDto } from '../dto/update-workspace-ai-privacy-mode.dto.js';
import { GetWorkspaceAiPrivacyModeQuery } from '../queries/get-workspace-ai-privacy-mode.query.js';
import { UpdateWorkspaceAiPrivacyModeCommand } from '../commands/update-workspace-ai-privacy-mode.command.js';

/// Module 11 — Privacy controls (task #234): per-workspace AI privacy mode
/// (CLOUD/LOCAL/HYBRID), consulted by AiProviderRegistryService.resolveProvider
/// to restrict which AI provider a request may use. See
/// AiPrivacyModeService's doc comment for the honest scope note re: ADR 0007.
@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai/privacy-mode')
export class AiPrivacyController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: "Get this workspace's AI privacy mode" })
  get(@CurrentUser() user: RequestUser): Promise<WorkspaceAiPrivacySettingDto> {
    return this.queryBus.execute(new GetWorkspaceAiPrivacyModeQuery(user.id));
  }

  @Put()
  @ApiOperation({ summary: "Update this workspace's AI privacy mode" })
  update(
    @Body() dto: UpdateWorkspaceAiPrivacyModeDto,
    @CurrentUser() user: RequestUser,
  ): Promise<WorkspaceAiPrivacySettingDto> {
    return this.commandBus.execute(
      new UpdateWorkspaceAiPrivacyModeCommand(user.id, dto),
    );
  }
}
