import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { WorkerNodeDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { Public } from '../../../common/decorators/public.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { ApiKeyAuthGuard } from '../../public-api/guards/api-key-auth.guard.js';
import { HeartbeatWorkerNodeDto, RegisterWorkerNodeDto } from '../dto/distributed-jobs.dto.js';
import {
  DeregisterWorkerNodeCommand,
  DrainWorkerNodeCommand,
  HeartbeatWorkerNodeCommand,
  RegisterWorkerNodeCommand,
} from '../commands/worker-nodes.commands.js';
import { ListWorkerNodesQuery } from '../queries/distributed-jobs.query.js';

/// Worker Discovery + registration/heartbeat. `register`/`heartbeat` are
/// machine-to-machine routes authenticated via `ApiKeyAuthGuard`
/// (`X-API-Key`, Module 9's Public API keys) rather than a human JWT — a
/// worker process is infrastructure, not a logged-in user. `list`/`drain`/
/// `deregister` stay on the normal JWT-authenticated org-member surface
/// (a human operator manages the fleet from the dashboard).
@ApiTags('distributed-jobs')
@Controller('enterprise/organizations/:organizationId/distributed-jobs/workers')
export class WorkerNodesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List worker nodes (worker discovery)' })
  list(@Param('organizationId') organizationId: string, @CurrentUser() user: RequestUser): Promise<WorkerNodeDto[]> {
    return this.queryBus.execute(new ListWorkerNodesQuery(user.id, organizationId));
  }

  @Post()
  @Public()
  @UseGuards(ApiKeyAuthGuard)
  @ApiSecurity('apiKey')
  @ApiOperation({ summary: 'Register a worker node (X-API-Key, ADMIN+ service account)' })
  register(
    @Param('organizationId') organizationId: string,
    @Body() dto: RegisterWorkerNodeDto,
    @CurrentUser() user: RequestUser,
  ): Promise<WorkerNodeDto> {
    return this.commandBus.execute(new RegisterWorkerNodeCommand(user.id, organizationId, dto));
  }

  @Post(':workerId/heartbeat')
  @Public()
  @UseGuards(ApiKeyAuthGuard)
  @ApiSecurity('apiKey')
  @ApiOperation({ summary: 'Renew a worker node heartbeat (X-API-Key)' })
  heartbeat(
    @Param('workerId') workerId: string,
    @Body() dto: HeartbeatWorkerNodeDto,
    @CurrentUser() user: RequestUser,
  ): Promise<WorkerNodeDto> {
    return this.commandBus.execute(new HeartbeatWorkerNodeCommand(user.id, workerId, dto.currentLoad, dto.version));
  }

  @Post(':workerId/drain')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Stop assigning new jobs to a worker (ADMIN+)' })
  async drain(
    @Param('organizationId') organizationId: string,
    @Param('workerId') workerId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.commandBus.execute(new DrainWorkerNodeCommand(user.id, organizationId, workerId));
  }

  @Delete(':workerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deregister a worker node, migrating its in-flight jobs back to the queue (ADMIN+)' })
  async deregister(
    @Param('organizationId') organizationId: string,
    @Param('workerId') workerId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.commandBus.execute(new DeregisterWorkerNodeCommand(user.id, organizationId, workerId));
  }
}
