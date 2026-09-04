import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type {
  AuthTokensDto,
  MfaConfirmResponseDto,
  MfaSetupResponseDto,
} from '@pentesthub/shared';
import { Public } from '../../../common/decorators/public.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { extractRequestContext } from '../../../common/utils/request-context.js';
import { MfaConfirmDto } from '../dto/mfa-confirm.dto.js';
import { MfaChallengeDto } from '../dto/mfa-challenge.dto.js';
import { MfaDisableDto } from '../dto/mfa-disable.dto.js';
import { MfaSetupUseCase } from '../use-cases/mfa-setup.use-case.js';
import { MfaConfirmUseCase } from '../use-cases/mfa-confirm.use-case.js';
import { MfaChallengeUseCase } from '../use-cases/mfa-challenge.use-case.js';
import { MfaDisableUseCase } from '../use-cases/mfa-disable.use-case.js';

@ApiTags('auth')
@Controller('auth/mfa')
export class MfaController {
  constructor(
    private readonly mfaSetupUseCase: MfaSetupUseCase,
    private readonly mfaConfirmUseCase: MfaConfirmUseCase,
    private readonly mfaChallengeUseCase: MfaChallengeUseCase,
    private readonly mfaDisableUseCase: MfaDisableUseCase,
  ) {}

  @ApiBearerAuth()
  @Post('setup')
  @ApiOperation({
    summary: 'Begin MFA setup — returns a TOTP secret + QR code',
  })
  setup(@CurrentUser() user: RequestUser): Promise<MfaSetupResponseDto> {
    return this.mfaSetupUseCase.execute(user.id);
  }

  @ApiBearerAuth()
  // Module 18 — task #512 (rate limiting audit). Accepts a guessable TOTP
  // code; was relying on the global 100/min/IP default only. Same 5/min
  // budget as the `challenge` endpoint below, which guards the identical
  // "guess a 6-digit code" surface.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('confirm')
  @ApiOperation({
    summary: 'Confirm MFA setup with a TOTP code — returns backup codes',
  })
  confirm(
    @Body() dto: MfaConfirmDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ): Promise<MfaConfirmResponseDto> {
    return this.mfaConfirmUseCase.execute({
      ...dto,
      userId: user.id,
      ...extractRequestContext(req),
    });
  }

  // Public: called mid-login, before an access token exists — authorized
  // instead by the short-lived mfaChallengeToken in the body.
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('challenge')
  @ApiOperation({ summary: 'Complete login with a TOTP or backup code' })
  challenge(
    @Body() dto: MfaChallengeDto,
    @Req() req: Request,
  ): Promise<AuthTokensDto> {
    return this.mfaChallengeUseCase.execute({
      ...dto,
      ...extractRequestContext(req),
    });
  }

  @ApiBearerAuth()
  // Module 18 — task #512 (rate limiting audit). Accepts a TOTP or backup
  // code; a bearer token alone doesn't bound the guess space (backup
  // codes in particular are the kind of secondary secret this endpoint
  // should assume an attacker with a stolen/leaked access token would
  // try to brute-force). Same 5/min budget as `challenge`/`confirm`.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('disable')
  @ApiOperation({
    summary: 'Disable MFA (requires a valid TOTP or backup code)',
  })
  disable(
    @Body() dto: MfaDisableDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ): Promise<void> {
    return this.mfaDisableUseCase.execute({
      ...dto,
      userId: user.id,
      ...extractRequestContext(req),
    });
  }
}
