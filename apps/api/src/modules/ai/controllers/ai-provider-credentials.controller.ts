import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { AiProviderCredentialDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { UpsertAiProviderCredentialDto } from '../dto/upsert-ai-provider-credential.dto.js';
import { ListAiProviderCredentialsQuery } from '../queries/list-ai-provider-credentials.query.js';
import { UpsertAiProviderCredentialCommand } from '../commands/upsert-ai-provider-credential.command.js';
import { DeleteAiProviderCredentialCommand } from '../commands/delete-ai-provider-credential.command.js';

/// Local-First Migration Phase 1 (BYOK) — lets a workspace store its own
/// AI provider API key instead of relying on the operator's shared
/// server-configured key. See docs/adr/0007 and
/// docs/migration/desktop-agent-roadmap.md Phase 1. One row per
/// (workspace, provider); `PUT` upserts, matching how the settings UI this
/// backs naturally works ("save my OpenAI key").
@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai/provider-credentials')
export class AiProviderCredentialsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: "List this workspace's stored AI provider credentials" })
  list(@CurrentUser() user: RequestUser): Promise<AiProviderCredentialDto[]> {
    return this.queryBus.execute(new ListAiProviderCredentialsQuery(user.id));
  }

  @Put(':provider')
  @ApiOperation({ summary: 'Save (create or update) this workspace\'s credential for a provider' })
  upsert(
    @Param('provider') provider: string,
    @Body() dto: UpsertAiProviderCredentialDto,
    @CurrentUser() user: RequestUser,
  ): Promise<AiProviderCredentialDto> {
    return this.commandBus.execute(
      new UpsertAiProviderCredentialCommand(user.id, provider, dto),
    );
  }

  @Delete(':provider')
  @ApiOperation({ summary: "Remove this workspace's credential for a provider" })
  delete(
    @Param('provider') provider: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    return this.commandBus.execute(
      new DeleteAiProviderCredentialCommand(user.id, provider),
    );
  }
}
