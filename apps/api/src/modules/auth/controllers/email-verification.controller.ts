import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../../../common/decorators/public.decorator.js';
import { extractRequestContext } from '../../../common/utils/request-context.js';
import { VerifyEmailDto } from '../dto/verify-email.dto.js';
import { ResendVerificationEmailDto } from '../dto/resend-verification-email.dto.js';
import { VerifyEmailUseCase } from '../use-cases/verify-email.use-case.js';
import { ResendVerificationEmailUseCase } from '../use-cases/resend-verification-email.use-case.js';

@ApiTags('auth')
@Controller('auth/verify-email')
export class EmailVerificationController {
  constructor(
    private readonly verifyEmailUseCase: VerifyEmailUseCase,
    private readonly resendVerificationEmailUseCase: ResendVerificationEmailUseCase,
  ) {}

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post()
  @ApiOperation({ summary: 'Verify email using a verification token' })
  verify(@Body() dto: VerifyEmailDto, @Req() req: Request): Promise<void> {
    return this.verifyEmailUseCase.execute({
      ...dto,
      ...extractRequestContext(req),
    });
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('resend')
  @ApiOperation({ summary: 'Resend the verification email' })
  resend(
    @Body() dto: ResendVerificationEmailDto,
    @Req() req: Request,
  ): Promise<void> {
    return this.resendVerificationEmailUseCase.execute({
      ...dto,
      ...extractRequestContext(req),
    });
  }
}
