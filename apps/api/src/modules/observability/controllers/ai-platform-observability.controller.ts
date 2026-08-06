import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryBus } from '@nestjs/cqrs';
import type { AiPlatformObservabilityDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { GetAiPlatformObservabilityQuery } from '../queries/ai-platform-observability.query.js';

/// Module 13 — AI Automation Platform Observability (task #290).
/// Authenticated + workspace-scoped (default `JwtAuthGuard`, no
/// `@Public()`) — unlike `MetricsController`'s Prometheus scrape
/// endpoints, this returns per-workspace operational data to a signed-in
/// member, not process-wide data to an unauthenticated scraper. See
/// `ai-platform-observability.ts`'s doc comment for the full rationale.
@ApiTags('observability')
@ApiBearerAuth()
@Controller('observability/ai-platform')
export class AiPlatformObservabilityController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @ApiOperation({ summary: 'AI automation platform dashboard — MCP tool usage, Agent SDK/Script/Workflow run stats, relay command queue depth, evaluation summary' })
  getDashboard(
    @Query('sinceDays') sinceDays: string | undefined,
    @CurrentUser() user: RequestUser,
  ): Promise<AiPlatformObservabilityDto> {
    return this.queryBus.execute(new GetAiPlatformObservabilityQuery(user.id, sinceDays ? Number(sinceDays) : undefined));
  }
}
