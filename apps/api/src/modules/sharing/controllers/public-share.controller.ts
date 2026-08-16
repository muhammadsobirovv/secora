import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus } from '@nestjs/cqrs';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { ResolvedShareLinkDto } from '@pentesthub/shared';
import { Public } from '../../../common/decorators/public.decorator.js';
import { AccessShareLinkDto } from '../dto/sharing.dto.js';
import { AccessShareLinkCommand } from '../commands/access-share-link.command.js';

/// The one route in this module a caller hits with *no* access token at
/// all — the raw share token in the URL, plus an optional password in
/// the body, is the entire credential. Throttled tightly (20/min per
/// IP) specifically to blunt token-guessing/password-brute-force, on top
/// of the token itself being a 256-bit random value (astronomically
/// infeasible to guess even unthrottled) and passwords being
/// argon2id-hashed (slow to verify by design). See
/// access-share-link.command.ts for the full not-found/revoked/expired/
/// wrong-password/cross-workspace handling.
@ApiTags('sharing')
@Controller('share')
export class PublicShareController {
  constructor(private readonly commandBus: CommandBus) {}

  @Public()
  @Post(':token/access')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Resolve a public share link (no auth) — pass password if the link requires one' })
  access(
    @Param('token') token: string,
    @Body() dto: AccessShareLinkDto,
    @Req() req: Request,
  ): Promise<ResolvedShareLinkDto> {
    return this.commandBus.execute(new AccessShareLinkCommand(token, dto.password, req.ip ?? '0.0.0.0'));
  }
}
