import { Body, Controller, Get, Header, Param, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { BackupRestoreInstructionsDto, BackupRunDto, TriggerBackupRequestDto } from '@pentesthub/shared';
import { BackupService } from '../backup.service.js';

/// Module 14 — Backup System / Disaster Recovery. `organizationId` is a
/// path segment (not query-string) with a `"_system"` sentinel meaning
/// "no organization scope" — a Community Edition single-tenant
/// deployment triggers/lists full-system backups this way, matching
/// `BACKUP_RUN_ENDPOINTS`'s default in `@pentesthub/shared`.
function resolveOrgId(organizationId: string): string | null {
  return organizationId === '_system' ? null : organizationId;
}

@ApiTags('backups')
@Controller('backups/:organizationId/runs')
export class BackupsController {
  constructor(private readonly backupService: BackupService) {}

  @Get()
  @ApiOperation({ summary: 'List backup runs (Admin Console "Backups" page)' })
  list(@Param('organizationId') organizationId: string): Promise<BackupRunDto[]> {
    return this.backupService.list(resolveOrgId(organizationId));
  }

  @Post()
  @ApiOperation({ summary: 'Trigger a manual backup' })
  trigger(
    @Param('organizationId') organizationId: string,
    @Body() dto: TriggerBackupRequestDto,
  ): Promise<BackupRunDto> {
    return this.backupService.trigger(resolveOrgId(organizationId), dto.scope ?? 'FULL', 'MANUAL', dto.encrypt ?? true);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one backup run' })
  get(@Param('organizationId') organizationId: string, @Param('id') id: string): Promise<BackupRunDto> {
    return this.backupService.get(resolveOrgId(organizationId), id);
  }

  @Get(':id/download')
  @Header('Content-Type', 'application/octet-stream')
  @ApiOperation({ summary: 'Download the raw backup archive (still gzipped/encrypted as stored — see restore-instructions for how to decrypt/restore it)' })
  async download(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { data, filename } = await this.backupService.downloadArchive(resolveOrgId(organizationId), id);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(data);
  }

  @Get(':id/restore-instructions')
  @ApiOperation({ summary: 'Operator-run restore procedure for this backup (never a one-click restore — see ADR 0014)' })
  restoreInstructions(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ): Promise<BackupRestoreInstructionsDto> {
    return this.backupService.restoreInstructions(resolveOrgId(organizationId), id);
  }

  @Post(':id/verify')
  @ApiOperation({ summary: 'Backup Verification — re-checksums the stored archive' })
  verify(@Param('organizationId') organizationId: string, @Param('id') id: string): Promise<BackupRunDto> {
    return this.backupService.verify(resolveOrgId(organizationId), id);
  }
}
