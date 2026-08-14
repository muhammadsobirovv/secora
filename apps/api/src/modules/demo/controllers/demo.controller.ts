import { Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AuthTokensDto } from '@pentesthub/shared';
import { Public } from '../../../common/decorators/public.decorator.js';
import { extractRequestContext } from '../../../common/utils/request-context.js';
import { DemoSessionService } from '../demo-session.service.js';

/// Module 15 — task #352 (demo mode). The one unauthenticated, publicly
/// reachable route this module adds — everything it creates (a synthetic
/// user, an `isDemo` workspace, pre-seeded sample data) exists precisely
/// so this endpoint is safe to leave open. Tightly throttled beyond the
/// app-wide default (see `@Throttle` below) since it's a write-heavy,
/// no-credential endpoint.
@ApiTags('demo')
@Controller('demo')
export class DemoController {
  constructor(private readonly demoSessionService: DemoSessionService) {}

  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('session')
  @ApiOperation({ summary: 'Start a new demo session — no account required' })
  startSession(@Req() req: Request): Promise<AuthTokensDto> {
    return this.demoSessionService.start(extractRequestContext(req));
  }
}
