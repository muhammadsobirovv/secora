import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { UserDataExportDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { AllowWithoutLegalAcceptance } from '../../../common/decorators/allow-without-legal-acceptance.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { extractRequestContext } from '../../../common/utils/request-context.js';
import { DeleteAccountDto } from '../dto/delete-account.dto.js';
import { ExportUserDataUseCase } from '../use-cases/export-user-data.use-case.js';
import { DeleteAccountUseCase } from '../use-cases/delete-account.use-case.js';

/// Module 15 — Privacy controls (task #342). Self-service data export and
/// account deletion, scoped to the calling user's own account — see
/// ExportUserDataUseCase/DeleteAccountUseCase doc comments for exactly
/// what is and isn't covered.
@ApiTags('auth')
@ApiBearerAuth()
// Privacy rights (export, deletion) stay available before acceptance.
@AllowWithoutLegalAcceptance()
@Controller('auth/privacy')
export class PrivacyController {
  constructor(
    private readonly exportUserDataUseCase: ExportUserDataUseCase,
    private readonly deleteAccountUseCase: DeleteAccountUseCase,
  ) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Get('data-export')
  @ApiOperation({ summary: "Export this account's own data as JSON" })
  export(@CurrentUser() user: RequestUser, @Req() req: Request): Promise<UserDataExportDto> {
    return this.exportUserDataUseCase.execute({
      userId: user.id,
      ...extractRequestContext(req),
    });
  }

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('delete-account')
  @ApiOperation({ summary: 'Permanently deactivate this account (requires current password)' })
  deleteAccount(
    @Body() dto: DeleteAccountDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ): Promise<void> {
    return this.deleteAccountUseCase.execute({
      ...dto,
      userId: user.id,
      ...extractRequestContext(req),
    });
  }
}
