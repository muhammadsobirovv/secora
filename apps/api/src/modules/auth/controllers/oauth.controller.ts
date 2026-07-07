import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { LoginResponseDto } from '@pentesthub/shared';
import { Public } from '../../../common/decorators/public.decorator.js';
import { extractRequestContext } from '../../../common/utils/request-context.js';
import type { EnvConfig } from '../../../config/env.validation.js';
import type { OAuthProfileResult } from '../strategies/oauth-profile.type.js';
import { OAuthExchangeDto } from '../dto/oauth-exchange.dto.js';
import { OAuthLoginUseCase } from '../use-cases/oauth-login.use-case.js';
import { OAuthExchangeUseCase } from '../use-cases/oauth-exchange.use-case.js';

interface OAuthRequest extends Request {
  user: OAuthProfileResult;
}

/// See decision 4, docs/adr/0001-auth-module.md: the callback never
/// returns tokens directly — it redirects with a one-time exchange code,
/// which the frontend POSTs to /auth/oauth/exchange for real tokens. Keeps
/// access/refresh tokens out of the redirect URL entirely.
@ApiTags('auth')
@Controller('auth/oauth')
export class OAuthController {
  constructor(
    private readonly oauthLoginUseCase: OAuthLoginUseCase,
    private readonly oauthExchangeUseCase: OAuthExchangeUseCase,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  @Public()
  @UseGuards(AuthGuard('google'))
  @Get('google')
  @ApiExcludeEndpoint()
  googleStart(): void {
    // AuthGuard('google') intercepts and redirects to Google before this
    // body ever runs.
  }

  @Public()
  @UseGuards(AuthGuard('google'))
  @Get('google/callback')
  @ApiExcludeEndpoint()
  async googleCallback(
    @Req() req: OAuthRequest,
    @Res() res: Response,
  ): Promise<void> {
    await this.handleCallback(req, res);
  }

  @Public()
  @UseGuards(AuthGuard('github'))
  @Get('github')
  @ApiExcludeEndpoint()
  githubStart(): void {
    // AuthGuard('github') intercepts and redirects to GitHub before this
    // body ever runs.
  }

  @Public()
  @UseGuards(AuthGuard('github'))
  @Get('github/callback')
  @ApiExcludeEndpoint()
  async githubCallback(
    @Req() req: OAuthRequest,
    @Res() res: Response,
  ): Promise<void> {
    await this.handleCallback(req, res);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('exchange')
  @ApiOperation({ summary: 'Exchange a one-time OAuth code for tokens' })
  exchange(
    @Body() dto: OAuthExchangeDto,
    @Req() req: Request,
  ): Promise<LoginResponseDto> {
    return this.oauthExchangeUseCase.execute({
      code: dto.code,
      ...extractRequestContext(req),
    });
  }

  private async handleCallback(
    req: OAuthRequest,
    res: Response,
  ): Promise<void> {
    const { exchangeCode } = await this.oauthLoginUseCase.execute({
      ...req.user,
      ...extractRequestContext(req),
    });
    const frontendUrl = this.configService.get('FRONTEND_URL', { infer: true });
    res.redirect(`${frontendUrl}/auth/oauth/callback?code=${exchangeCode}`);
  }
}
