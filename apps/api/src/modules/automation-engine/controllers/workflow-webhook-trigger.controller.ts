import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus } from '@nestjs/cqrs';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../common/decorators/public.decorator.js';
import { TriggerWorkflowByWebhookCommand } from '../commands/workflow-runs.commands.js';

/// Module 13 — Workflow Builder inbound WEBHOOK trigger (task #283).
/// `@Public()` — the path-embedded token IS the credential, same trust
/// model as any other inbound provider webhook this platform receives
/// (no bearer/JWT expected, no organization/workspace context to check
/// against since the token itself already resolves to exactly one
/// workflow).
@ApiTags('automation-engine')
@Controller('public/workflow-triggers')
export class WorkflowWebhookTriggerController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post(':token')
  @Public()
  // Module 18 — task #512 (rate limiting audit). This was the most severe
  // gap the audit found: fully unauthenticated-by-design (see class doc
  // comment — the token IS the credential) and, unlike a passive webhook
  // receiver, actually starts real execution on success (a Workflow run,
  // which can itself contain AI/tool steps) — was relying on the global
  // 100/min/IP default only. 20/min/IP is generous for a legitimate
  // integration's webhook cadence while bounding an attacker who obtains
  // or brute-forces a token from spamming workflow runs. This is still
  // IP-keyed, not per-token — a distributed caller isn't stopped by this
  // alone; the token's own unguessability is the primary control here.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Start a workflow run from an inbound webhook call' })
  trigger(@Param('token') token: string, @Body() body: Record<string, unknown>): Promise<{ runId: string }> {
    return this.commandBus.execute(new TriggerWorkflowByWebhookCommand(token, body ?? {}));
  }
}
