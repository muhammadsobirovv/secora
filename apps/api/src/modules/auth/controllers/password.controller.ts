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
import { Public } from '../../../common/decorators/public.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { extractRequestContext } from '../../../common/utils/request-context.js';
import { ForgotPasswordDto } from '../dto/forgot-password.dto.js';
import { ResetPasswordDto } from '../dto/reset-password.dto.js';
import { ChangePasswordDto } from '../dto/change-password.dto.js';
import { ForgotPasswordUseCase } from '../use-cases/forgot-password.use-case.js';
import { ResetPasswordUseCase } from '../use-cases/reset-password.use-case.js';
import { ChangePasswordUseCase } from '../use-cases/change-password.use-case.js';

@ApiTags('auth')
@Controller('auth/password')
export class PasswordController {
  constructor(
    private readonly forgotPasswordUseCase: ForgotPasswordUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
    private readonly changePasswordUseCase: ChangePasswordUseCase,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('forgot')
  @ApiOperation({ summary: 'Request a password reset email' })
  forgot(@Body() dto: ForgotPasswordDto, @Req() req: Request): Promise<void> {
    return this.forgotPasswordUseCase.execute({
      ...dto,
      ...extractRequestContext(req),
    });
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('reset')
  @ApiOperation({ summary: 'Reset password using a reset token' })
  reset(@Body() dto: ResetPasswordDto, @Req() req: Request): Promise<void> {
    return this.resetPasswordUseCase.execute({
      ...dto,
      ...extractRequestContext(req),
    });
  }

  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('change')
  @ApiOperation({ summary: 'Change password (authenticated)' })
  change(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ): Promise<void> {
    return this.changePasswordUseCase.execute({
      ...dto,
      userId: user.id,
      currentSessionId: user.sessionId,
      ...extractRequestContext(req),
    });
  }
}
