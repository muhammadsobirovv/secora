import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { SessionSummaryDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { extractRequestContext } from '../../../common/utils/request-context.js';
import { ListSessionsUseCase } from '../use-cases/list-sessions.use-case.js';
import { RevokeSessionUseCase } from '../use-cases/revoke-session.use-case.js';

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth/sessions')
export class SessionsController {
  constructor(
    private readonly listSessionsUseCase: ListSessionsUseCase,
    private readonly revokeSessionUseCase: RevokeSessionUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List active sessions/devices for the current user',
  })
  list(@CurrentUser() user: RequestUser): Promise<SessionSummaryDto[]> {
    return this.listSessionsUseCase.execute(user.id, user.sessionId);
  }

  @Delete(':sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a session/device' })
  revoke(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ): Promise<void> {
    return this.revokeSessionUseCase.execute({
      sessionId,
      userId: user.id,
      ...extractRequestContext(req),
    });
  }
}
