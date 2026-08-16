import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { PlaybookApprovalDto, PlaybookExecutionDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { DecidePlaybookApprovalDto } from '../dto/playbook.dto.js';
import { DecidePlaybookApprovalCommand } from '../commands/decide-playbook-approval.command.js';
import {
  GetPlaybookExecutionQuery,
  ListPlaybookApprovalsQuery,
} from '../queries/playbook-execution.queries.js';

@ApiTags('playbooks')
@ApiBearerAuth()
@Controller()
export class PlaybookExecutionsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get('playbook-executions/:executionId')
  @ApiOperation({ summary: 'Get a playbook execution (own workspace only)' })
  getExecution(@Param('executionId') executionId: string, @CurrentUser() user: RequestUser): Promise<PlaybookExecutionDto> {
    return this.queryBus.execute(new GetPlaybookExecutionQuery(user.id, executionId));
  }

  @Get('playbook-approvals')
  @ApiOperation({ summary: 'List playbook approval requests in the caller workspace' })
  listApprovals(@CurrentUser() user: RequestUser): Promise<PlaybookApprovalDto[]> {
    return this.queryBus.execute(new ListPlaybookApprovalsQuery(user.id));
  }

  @Post('playbook-approvals/:id/decide')
  @ApiOperation({ summary: 'Approve or reject a WAITING_APPROVAL playbook step — a rejection stops every dependent step' })
  decide(
    @Param('id') id: string,
    @Body() dto: DecidePlaybookApprovalDto,
    @CurrentUser() user: RequestUser,
  ): Promise<PlaybookApprovalDto> {
    return this.commandBus.execute(new DecidePlaybookApprovalCommand(user.id, id, dto));
  }
}
