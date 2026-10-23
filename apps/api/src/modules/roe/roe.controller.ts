import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  ROE_LIMITS,
  type CreateRoeRequestDto,
  type RoeAuthorizationDto,
  type RoePublicOutcome,
  type RoePublicRequestDto,
} from '@pentesthub/shared';
import { AppException } from '../../common/exceptions/app.exception.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import type { RequestUser } from '../../common/types/authenticated-request.js';
import { extractRequestContext } from '../../common/utils/request-context.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../workspaces/domain/repositories/workspaces.repository.interface.js';
import { RoeAuthorizationService, type RoeRequester } from './roe-authorization.service.js';

/// The requester's side: ask for a client's approval, follow it, cancel it.
@ApiTags('roe')
@ApiBearerAuth()
@Controller('roe')
export class RoeController {
  constructor(
    private readonly roe: RoeAuthorizationService,
    private readonly prisma: PrismaService,
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspaces: WorkspacesRepository,
  ) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('evidence', { limits: { fileSize: ROE_LIMITS.evidenceMaxBytes, files: 1 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Request a client engagement authorization (multipart: "data" JSON + optional "evidence" file)',
  })
  async create(
    @Body('data') rawData: unknown,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ): Promise<RoeAuthorizationDto> {
    const data = this.parseData(rawData);
    const workspace = await this.workspaces.findPersonalWorkspaceForUser(user.id);
    if (!workspace) {
      throw new AppException('ROE_INVALID_REQUEST', 'No workspace found for this account.', HttpStatus.BAD_REQUEST);
    }
    return this.roe.create({
      requester: await this.requester(user),
      workspaceId: workspace.id,
      data,
      evidence: file ? { buffer: file.buffer, originalname: file.originalname } : undefined,
      context: extractRequestContext(req),
    });
  }

  @Get()
  @ApiOperation({ summary: 'My client engagement authorizations' })
  list(@CurrentUser() user: RequestUser): Promise<RoeAuthorizationDto[]> {
    return this.roe.list(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One authorization (status, assets, window)' })
  get(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<RoeAuthorizationDto> {
    return this.roe.get(user.id, id);
  }

  @Post(':id/resend')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Send the approval email again (10 minute cooldown)' })
  async resend(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ): Promise<RoeAuthorizationDto> {
    return this.roe.resend({ requester: await this.requester(user), id, context: extractRequestContext(req) });
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a pending request or end an approved engagement' })
  cancel(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ): Promise<RoeAuthorizationDto> {
    return this.roe.cancel({ userId: user.id, id, context: extractRequestContext(req) });
  }

  /// Evidence is only ever sent as a download, never rendered by the browser.
  @Get(':id/evidence')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Download the attached evidence file' })
  async evidence(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.roe.evidence(user.id, id);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${file.name.replace(/[^A-Za-z0-9._() -]/g, '_')}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(file.data);
  }

  private parseData(raw: unknown): CreateRoeRequestDto {
    try {
      const value: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (value && typeof value === 'object' && !Array.isArray(value)) return value as CreateRoeRequestDto;
    } catch {
      // fall through
    }
    throw new AppException('ROE_INVALID_REQUEST', 'The request details are missing or malformed.', HttpStatus.BAD_REQUEST);
  }

  private async requester(user: RequestUser): Promise<RoeRequester> {
    const row = await this.prisma.user.findUnique({ where: { id: user.id }, select: { displayName: true } });
    return { id: user.id, email: user.email, displayName: row?.displayName ?? user.email };
  }
}

/// The client's side. No login: the single-use link is the credential. Opening
/// a link only shows the request; approving, declining and revoking are POSTs.
@ApiTags('roe')
@Controller('roe/public')
export class PublicRoeController {
  constructor(private readonly roe: RoeAuthorizationService) {}

  @Public()
  @Get(':token')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Show an approval or revoke request (read only)' })
  async show(@Param('token') token: string, @Res({ passthrough: true }) res: Response): Promise<RoePublicRequestDto> {
    this.noStore(res);
    return this.roe.getForClient(token);
  }

  @Public()
  @Post(':token/approve')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Approve the request' })
  async approve(
    @Param('token') token: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ outcome: RoePublicOutcome }> {
    this.noStore(res);
    return { outcome: await this.roe.approve(token, extractRequestContext(req)) };
  }

  @Public()
  @Post(':token/decline')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Decline the request' })
  async decline(
    @Param('token') token: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ outcome: RoePublicOutcome }> {
    this.noStore(res);
    return { outcome: await this.roe.decline(token, extractRequestContext(req)) };
  }

  @Public()
  @Post(':token/revoke')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Withdraw an approval' })
  async revoke(
    @Param('token') token: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ outcome: RoePublicOutcome }> {
    this.noStore(res);
    return { outcome: await this.roe.revoke(token, extractRequestContext(req)) };
  }

  private noStore(res: Response): void {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Referrer-Policy', 'no-referrer');
  }
}
