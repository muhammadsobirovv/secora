import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus } from '@nestjs/cqrs';
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
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Start a workflow run from an inbound webhook call' })
  trigger(@Param('token') token: string, @Body() body: Record<string, unknown>): Promise<{ runId: string }> {
    return this.commandBus.execute(new TriggerWorkflowByWebhookCommand(token, body ?? {}));
  }
}
