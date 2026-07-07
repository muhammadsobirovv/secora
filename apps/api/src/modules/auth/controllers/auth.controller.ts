import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type {
  AuthenticatedUserDto,
  AuthTokensDto,
  LoginResponseDto,
  RegisterResponseDto,
} from '@pentesthub/shared';
import { Public } from '../../../common/decorators/public.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { extractRequestContext } from '../../../common/utils/request-context.js';
import { RegisterDto } from '../dto/register.dto.js';
import { LoginDto } from '../dto/login.dto.js';
import { RefreshDto } from '../dto/refresh.dto.js';
import { LogoutDto } from '../dto/logout.dto.js';
import { RegisterUseCase } from '../use-cases/register.use-case.js';
import { LoginUseCase } from '../use-cases/login.use-case.js';
import { RefreshUseCase } from '../use-cases/refresh.use-case.js';
import { LogoutUseCase } from '../use-cases/logout.use-case.js';
import { GetCurrentUserUseCase } from '../use-cases/get-current-user.use-case.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerUseCase: RegisterUseCase,
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshUseCase: RefreshUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly getCurrentUserUseCase: GetCurrentUserUseCase,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @ApiOperation({ summary: 'Register a new account' })
  register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
  ): Promise<RegisterResponseDto> {
    return this.registerUseCase.execute({
      ...dto,
      ...extractRequestContext(req),
    });
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ApiOperation({ summary: 'Log in with email and password' })
  login(@Body() dto: LoginDto, @Req() req: Request): Promise<LoginResponseDto> {
    return this.loginUseCase.execute({ ...dto, ...extractRequestContext(req) });
  }

  // Public: the whole point is exchanging a refresh token for a new access
  // token once the old one has expired, so no valid access token is
  // required to call this.
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @ApiOperation({ summary: 'Rotate a refresh token for a new access token' })
  refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
  ): Promise<AuthTokensDto> {
    return this.refreshUseCase.execute({
      ...dto,
      ...extractRequestContext(req),
    });
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  @ApiOperation({ summary: 'Revoke the session tied to this refresh token' })
  logout(@Body() dto: LogoutDto, @Req() req: Request): Promise<void> {
    return this.logoutUseCase.execute({
      ...dto,
      ...extractRequestContext(req),
    });
  }

  @Get('me')
  @ApiOperation({ summary: 'Get the current authenticated user' })
  me(@CurrentUser() user: RequestUser): Promise<AuthenticatedUserDto> {
    return this.getCurrentUserUseCase.execute(user.id);
  }
}
