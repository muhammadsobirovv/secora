import {
  Body,
  Controller,
  Get,
  Inject,
  MessageEvent,
  NotFoundException,
  Param,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Observable, map } from 'rxjs';
import type {
  OrchestrationExplanationDto,
  OrchestrationRunDto,
  OrchestrationRunSummaryDto,
  OrchestrationStreamEvent,
} from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { CreateOrchestrationRunDto } from '../dto/create-orchestration-run.dto.js';
import { ListOrchestrationRunsQueryParamsDto } from '../dto/list-orchestration-runs-query.dto.js';
import { StartOrchestrationRunCommand } from '../commands/start-orchestration-run.command.js';
import { CancelOrchestrationRunCommand } from '../commands/cancel-orchestration-run.command.js';
import { RetryOrchestrationRunCommand } from '../commands/retry-orchestration-run.command.js';
import { GetOrchestrationRunQuery } from '../queries/get-orchestration-run.query.js';
import { ListOrchestrationRunsQuery } from '../queries/list-orchestration-runs.query.js';
import { ExplainOrchestrationRunQuery } from '../queries/explain-orchestration-run.query.js';
import { AgentOrchestrationStreamHubService } from '../orchestrator/agent-orchestration-stream-hub.service.js';
import { AgentOrchestratorService } from '../orchestrator/agent-orchestrator.service.js';
import {
  AGENT_ORCHESTRATION_REPOSITORY,
  type AgentOrchestrationRepository,
} from '../domain/repositories/agent-orchestration.repository.interface.js';
import {
  resolveOrchestrationRunForCaller,
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../agent-authorization.util.js';

/// Module 11 — Controllers + Swagger + module wiring + events (task #236).
/// The Master AI Orchestrator's HTTP surface — previously only reachable
/// via direct injection from WorkflowExecutorService (Module 10's
/// `ai_agent_run` workflow step). Follows the exact "create row, kick off
/// in background, stream via hub" SSE shape AiConversationsController's
/// streamMessage endpoint established (see that method's doc comment): a
/// live active stream if one exists, else a single terminal event built
/// from the persisted OrchestrationRun for a client that connects/
/// reconnects after the run already finished.
@ApiTags('agent')
@ApiBearerAuth()
@Controller('agent/runs')
export class AgentRunsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly streamHub: AgentOrchestrationStreamHubService,
    private readonly orchestrator: AgentOrchestratorService,
    // Module 18 — task #517 (SSE hardening). Both added solely so
    // stream() below can authorize the connection — see that method's
    // comment.
    @Inject(AGENT_ORCHESTRATION_REPOSITORY)
    private readonly orchestrationRepository: AgentOrchestrationRepository,
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List this workspace\'s orchestration runs' })
  list(
    @Query() query: ListOrchestrationRunsQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<OrchestrationRunSummaryDto[]> {
    return this.queryBus.execute(new ListOrchestrationRunsQuery(user.id, query));
  }

  @Post()
  @ApiOperation({ summary: 'Start a new Master AI Orchestrator run for a goal' })
  create(
    @Body() dto: CreateOrchestrationRunDto,
    @CurrentUser() user: RequestUser,
  ): Promise<OrchestrationRunDto> {
    return this.commandBus.execute(new StartOrchestrationRunCommand(user.id, dto));
  }

  @Get(':runId')
  @ApiOperation({ summary: 'Get one orchestration run, with its full task tree' })
  get(
    @Param('runId') runId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<OrchestrationRunDto> {
    return this.queryBus.execute(new GetOrchestrationRunQuery(user.id, runId));
  }

  @Post(':runId/cancel')
  @ApiOperation({ summary: 'Cancel a running orchestration run' })
  cancel(
    @Param('runId') runId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<boolean> {
    return this.commandBus.execute(new CancelOrchestrationRunCommand(user.id, runId));
  }

  @Post(':runId/retry')
  @ApiOperation({ summary: 'Retry a failed orchestration run\'s failed tasks' })
  retry(
    @Param('runId') runId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<OrchestrationRunDto | null> {
    return this.commandBus.execute(new RetryOrchestrationRunCommand(user.id, runId));
  }

  @Get(':runId/explain')
  @ApiOperation({ summary: 'Explainability: plan reasoning + per-task evidence for a run' })
  explain(
    @Param('runId') runId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<OrchestrationExplanationDto> {
    return this.queryBus.execute(new ExplainOrchestrationRunQuery(user.id, runId));
  }

  // Module 18 — task #517 (SSE hardening audit). Previously had no
  // @CurrentUser() at all — `runId` came straight from the route param
  // with zero ownership check, unlike every sibling REST endpoint in this
  // same controller (get/cancel/retry/explain all thread user.id through
  // their query/command). Any authenticated user who knew/guessed another
  // workspace's runId got that workspace's live orchestration stream (via
  // the unscoped `streamHub.get()` Map lookup) or its terminal
  // status/error (via the unscoped `orchestrator.getRun()`). Now
  // authorizes via the same resolveOrchestrationRunForCaller() the sibling
  // GetOrchestrationRunQuery handler already uses, before ever touching
  // the stream hub or orchestrator with the caller-supplied runId.
  @Sse(':runId/stream')
  @ApiOperation({ summary: 'Live SSE stream of an orchestration run in progress' })
  stream(
    @Param('runId') runId: string,
    @CurrentUser() user: RequestUser,
  ): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let cancelled = false;
      let innerSubscription: { unsubscribe(): void } | undefined;

      void resolveOrchestrationRunForCaller(
        this.orchestrationRepository,
        this.workspacesRepository,
        user.id,
        runId,
      )
        .then(() => {
          if (cancelled) return;

          const active = this.streamHub.get(runId);
          if (active) {
            innerSubscription = active.subject
              .asObservable()
              .pipe(map((event) => ({ data: event })))
              .subscribe(subscriber);
            return;
          }

          void this.orchestrator.getRun(runId).then((run) => {
            if (cancelled) return;
            if (!run) {
              subscriber.error(new NotFoundException('Orchestration run not found'));
              return;
            }
            const event: OrchestrationStreamEvent =
              run.status === 'FAILED'
                ? { type: 'run_failed', message: run.errorMessage ?? 'Run failed.' }
                : run.status === 'CANCELLED'
                  ? { type: 'cancelled' }
                  : { type: 'run_completed', run };
            subscriber.next({ data: event });
            subscriber.complete();
          });
        })
        .catch((error: unknown) => subscriber.error(error));

      return () => {
        cancelled = true;
        innerSubscription?.unsubscribe();
      };
    });
  }
}
