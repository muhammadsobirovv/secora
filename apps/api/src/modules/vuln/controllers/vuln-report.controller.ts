import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus } from '@nestjs/cqrs';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Response } from 'express';
import type {
  FindingExplanationDto,
  ReportLanguage,
  ResolvedShareLinkDto,
  VulnReportDto,
} from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { Public } from '../../../common/decorators/public.decorator.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { AccessShareLinkCommand } from '../../sharing/commands/access-share-link.command.js';
import { REPORT_CSP, renderReportHtml } from '../report/report.html.js';
import { renderReportPdf } from '../report/report.pdf.js';
import {
  parseLanguage,
  toPublicReport,
  VulnReportService,
} from '../report/vuln-report.service.js';

class ExplainDto {
  @IsOptional() @IsIn(['en', 'uz', 'ru']) language?: ReportLanguage;
}

class PublicReportDto {
  @IsOptional() @IsString() @MaxLength(200) password?: string;
  @IsOptional() @IsIn(['en', 'uz', 'ru']) language?: ReportLanguage;
}

function slug(report: VulnReportDto): string {
  return `secora-report-${report.target.value.replace(/[^a-z0-9.-]+/gi, '-').slice(0, 60)}`;
}

/// The report of a scan job: JSON for the app, HTML to read or print, PDF and
/// JSON to download. All of it is built from stored results; none of these
/// routes sends a request to the scanned site.
@ApiTags('vuln')
@ApiBearerAuth()
@Controller('vuln/jobs/:jobId')
export class VulnReportController {
  constructor(private readonly reports: VulnReportService) {}

  @Get('report')
  @ApiOperation({
    summary: 'The report of a scan (score, findings, what was not tested)',
  })
  async get(
    @Param('jobId') jobId: string,
    @Query('lang') lang: string | undefined,
    @CurrentUser() user: RequestUser,
  ): Promise<VulnReportDto> {
    return (await this.reports.forCaller(user.id, jobId, parseLanguage(lang)))
      .report;
  }

  @Get('report.html')
  @Header('Content-Security-Policy', REPORT_CSP)
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Print-friendly HTML report' })
  async html(
    @Param('jobId') jobId: string,
    @Query('lang') lang: string | undefined,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ): Promise<void> {
    const { report } = await this.reports.forCaller(
      user.id,
      jobId,
      parseLanguage(lang),
    );
    res
      .type('text/html; charset=utf-8')
      .send(
        renderReportHtml(report, {
          explanations: await this.reports.existingExplanations(report),
        }),
      );
  }

  @Get('report.pdf')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary:
      'PDF report (Latin letters; use the HTML report for the original alphabet)',
  })
  async pdf(
    @Param('jobId') jobId: string,
    @Query('lang') lang: string | undefined,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ): Promise<void> {
    const { report } = await this.reports.forCaller(
      user.id,
      jobId,
      parseLanguage(lang),
    );
    res
      .type('application/pdf')
      .setHeader(
        'Content-Disposition',
        `attachment; filename="${slug(report)}.pdf"`,
      )
      .send(
        renderReportPdf(report, {
          explanations: await this.reports.existingExplanations(report),
        }),
      );
  }

  @Get('report.json')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'JSON export of the report' })
  async json(
    @Param('jobId') jobId: string,
    @Query('lang') lang: string | undefined,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ): Promise<void> {
    const { report } = await this.reports.forCaller(
      user.id,
      jobId,
      parseLanguage(lang),
    );
    res
      .type('application/json')
      .setHeader(
        'Content-Disposition',
        `attachment; filename="${slug(report)}.json"`,
      )
      .send(JSON.stringify(report, null, 2));
  }

  @Post('findings/:findingId/explanation')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Explain a finding in plain language (AI when available, built-in text otherwise)',
  })
  async explain(
    @Param('jobId') jobId: string,
    @Param('findingId') findingId: string,
    @Body() dto: ExplainDto,
    @CurrentUser() user: RequestUser,
  ): Promise<FindingExplanationDto> {
    const { report, workspaceId } = await this.reports.forCaller(
      user.id,
      jobId,
      parseLanguage(dto.language),
    );
    return this.reports.explainFinding(user.id, workspaceId, report, findingId);
  }
}

/// The page a share link opens. No login: the link's token (and its password,
/// if it has one) is the credential, and an expired or revoked link is refused
/// by the same handler every other share link uses. The result is the report
/// only: no workspace id, no job logs, evidence already redacted.
@ApiTags('sharing')
@Controller('share')
export class PublicVulnReportController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly reports: VulnReportService,
  ) {}

  @Public()
  @Post(':token/report')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Read a shared scan report (no auth; password if the link has one)',
  })
  async report(
    @Param('token') token: string,
    @Body() dto: PublicReportDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<VulnReportDto> {
    const link = await this.commandBus.execute<
      AccessShareLinkCommand,
      ResolvedShareLinkDto
    >(new AccessShareLinkCommand(token, dto.password, res.req.ip ?? '0.0.0.0'));
    if (link.resourceType !== 'VULN_SCAN_REPORT') {
      throw new AppException(
        'SHARE_LINK_NOT_FOUND',
        'This share link is invalid.',
        HttpStatus.NOT_FOUND,
      );
    }
    return toPublicReport(
      await this.reports.forJob(link.resourceId, parseLanguage(dto.language)),
    );
  }
}
