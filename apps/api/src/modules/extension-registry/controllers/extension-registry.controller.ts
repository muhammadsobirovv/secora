import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Throttle } from '@nestjs/throttler';
import type { ExtensionDto, ExtensionInvocationResultDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { InvokeExtensionDto, ListExtensionsQueryParamsDto, RegisterExtensionDto } from '../dto/extension-registry.dto.js';
import {
  DisableExtensionCommand,
  EnableExtensionCommand,
  InvokeExtensionCommand,
  RegisterExtensionCommand,
  UnregisterExtensionCommand,
} from '../commands/extension-registry.commands.js';
import { GetExtensionQuery, ListExtensionsQuery } from '../queries/extension-registry.query.js';

/// Module 16 — Extension API registry (task #401). Matches
/// `EXTENSION_REGISTRY_ENDPOINTS` in packages/shared exactly. No
/// `:workspaceId` in the path — extensions are registered against the
/// caller's own workspace, same posture as AI Memory/Knowledge Graph
/// (see ResearcherMemoryWorkspaceResolver's doc comment).
@ApiTags('extensions')
@ApiBearerAuth()
@Controller('extensions')
export class ExtensionRegistryController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List registered extensions (optionally filtered by type/enabled)' })
  list(@Query() query: ListExtensionsQueryParamsDto, @CurrentUser() user: RequestUser): Promise<ExtensionDto[]> {
    return this.queryBus.execute(new ListExtensionsQuery(user.id, query));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one registered extension' })
  get(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<ExtensionDto> {
    return this.queryBus.execute(new GetExtensionQuery(user.id, id));
  }

  @Post()
  @ApiOperation({ summary: 'Register a new extension (recon/scanner/intelligence provider, AI agent, report template, workflow node, or marketplace plugin)' })
  register(@Body() dto: RegisterExtensionDto, @CurrentUser() user: RequestUser): Promise<ExtensionDto> {
    return this.commandBus.execute(new RegisterExtensionCommand(user.id, dto));
  }

  @Post(':id/enable')
  @ApiOperation({ summary: 'Enable a registered extension' })
  enable(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<ExtensionDto> {
    return this.commandBus.execute(new EnableExtensionCommand(user.id, id));
  }

  @Post(':id/disable')
  @ApiOperation({ summary: 'Disable a registered extension (blocks permission enforcement from authorizing it)' })
  disable(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<ExtensionDto> {
    return this.commandBus.execute(new DisableExtensionCommand(user.id, id));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unregister (permanently remove) an extension' })
  async unregister(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<void> {
    await this.commandBus.execute(new UnregisterExtensionCommand(user.id, id));
  }

  /// Hardening pass (task #454): the real invocation path —
  /// ExtensionPermissionEnforcer.assertAuthorized() runs before any
  /// network call. Throttled tighter than the global default (100/60s)
  /// because every call here makes a real outbound HTTP request to a
  /// (workspace-controlled but still external) URL.
  @Post(':id/invoke')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Invoke a registered extension (permission-checked, SSRF-guarded HTTP call to its entrypoint)' })
  invoke(
    @Param('id') id: string,
    @Body() dto: InvokeExtensionDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ExtensionInvocationResultDto> {
    return this.commandBus.execute(new InvokeExtensionCommand(user.id, id, dto));
  }
}
