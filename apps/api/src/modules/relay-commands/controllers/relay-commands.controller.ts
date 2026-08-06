import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { RelayCommandDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { CompleteRelayCommandDto, ListPendingRelayCommandsQueryParamsDto } from '../dto/relay-commands.dto.js';
import { CompleteRelayCommandCommand } from '../commands/relay-commands.commands.js';
import { ListPendingRelayCommandsQuery } from '../queries/relay-commands.queries.js';

/// Module 13 — Local Execution (task #288). The real, working half of
/// "run this on my Desktop Agent / Browser Extension" — `McpToolRegistryService`'s
/// `desktop_agent_command`/`browser_extension_command` MCP tools enqueue
/// into `RelayCommand` rows here.
///
/// **Disclosed gap**: nothing in this codebase polls these endpoints yet.
/// The Desktop Agent (`apps/desktop`, Rust/Tauri) already has an
/// authenticated HTTP client (`sync::client::SyncClient`) and a
/// background poll loop (`sync::engine::SyncEngine::spawn_background`,
/// currently push/pulling Project/Target/Note/etc entities against a
/// `desktop-sync` REST surface that itself has no server-side
/// implementation in this codebase — a pre-existing Module 7 gap
/// discovered while building this task, out of scope to backfill here).
/// The intended integration point for a future pass: add a
/// `fetch_pending_commands` method to `SyncClient` calling
/// `GET /relay-commands/pending?target=DESKTOP`, give `SyncEngine` a
/// handle to the already-existing `Arc<JobQueue>` (a sibling field on
/// `AppState`, not currently wired into `SyncEngine`), and on each poll
/// tick dispatch any returned command to `JobQueue::enqueue(...)`, then
/// `POST /relay-commands/:id/complete` with the result. Deliberately not
/// implemented in this pass — this sandbox has no Rust toolchain
/// available to compile-check a change to `apps/desktop`'s Cargo
/// workspace, and shipping unverified Rust is worse than shipping a
/// clearly documented, working server-side half. The Browser Extension
/// side (`target=BROWSER`) has the analogous gap in
/// `apps/browser-extension/shared/bridge-client.ts`.
@ApiTags('relay-commands')
@ApiBearerAuth()
@Controller('relay-commands')
export class RelayCommandsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get('pending')
  @ApiOperation({ summary: 'Poll for and claim pending relay commands for a target (DESKTOP/BROWSER)' })
  listPending(
    @Query() query: ListPendingRelayCommandsQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<RelayCommandDto[]> {
    return this.queryBus.execute(new ListPendingRelayCommandsQuery(user.id, query));
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Report the result of a relay command run locally' })
  complete(
    @Param('id') id: string,
    @Body() dto: CompleteRelayCommandDto,
    @CurrentUser() user: RequestUser,
  ): Promise<RelayCommandDto> {
    return this.commandBus.execute(new CompleteRelayCommandCommand(user.id, id, dto));
  }
}
