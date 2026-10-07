import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { LegalStatusDto } from '@pentesthub/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { AllowWithoutLegalAcceptance } from '../../common/decorators/allow-without-legal-acceptance.decorator.js';
import type { RequestUser } from '../../common/types/authenticated-request.js';
import { extractRequestContext } from '../../common/utils/request-context.js';
import { AcceptLegalDto } from './dto/accept-legal.dto.js';
import { LegalService } from './legal.service.js';

@ApiTags('legal')
@ApiBearerAuth()
@AllowWithoutLegalAcceptance()
@Controller('legal')
export class LegalController {
  constructor(private readonly legalService: LegalService) {}

  @Get('status')
  @ApiOperation({
    summary: 'Current legal version and whether the caller must accept it',
  })
  status(@CurrentUser() user: RequestUser): Promise<LegalStatusDto> {
    return this.legalService.getStatus(user.id);
  }

  @Post('accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Accept the current Terms, Acceptable Use Policy and Privacy Policy',
  })
  async accept(
    @CurrentUser() user: RequestUser,
    @Body() dto: AcceptLegalDto,
    @Req() req: Request,
  ): Promise<LegalStatusDto> {
    await this.legalService.recordAcceptance({
      userId: user.id,
      version: dto.version,
      ...extractRequestContext(req),
    });
    return this.legalService.getStatus(user.id);
  }
}
