import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { BackupPolicyDto, ComplianceExportRequestDto, DataRetentionPolicyDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { CreateComplianceExportDto, UpsertBackupPolicyDto, UpsertDataRetentionPolicyDto } from '../dto/compliance.dto.js';
import { DeleteDataRetentionPolicyCommand, UpsertDataRetentionPolicyCommand } from '../commands/data-retention-policies.commands.js';
import { UpsertBackupPolicyCommand } from '../commands/backup-policies.commands.js';
import { CreateComplianceExportRequestCommand } from '../commands/compliance-exports.commands.js';
import {
  GetBackupPolicyQuery,
  GetComplianceExportRequestQuery,
  ListComplianceExportRequestsQuery,
  ListDataRetentionPoliciesQuery,
} from '../queries/compliance.query.js';

/// Module 10 — Compliance. Org-scoped like the rest of the enterprise
/// surface; every mutating route requires `ADMIN`+ (see each command
/// handler's `requireEnterpriseRole` call) since retention/backup
/// posture and data exports are governance-level actions, not
/// day-to-day operations.
@ApiTags('compliance')
@ApiBearerAuth()
@Controller('enterprise/organizations/:organizationId/compliance')
export class ComplianceController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get('retention-policies')
  @ApiOperation({ summary: 'List data retention policies' })
  listRetentionPolicies(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<DataRetentionPolicyDto[]> {
    return this.queryBus.execute(new ListDataRetentionPoliciesQuery(user.id, organizationId));
  }

  @Put('retention-policies')
  @ApiOperation({ summary: 'Create or update a data retention policy for a resource type (Admin+)' })
  upsertRetentionPolicy(
    @Param('organizationId') organizationId: string,
    @Body() dto: UpsertDataRetentionPolicyDto,
    @CurrentUser() user: RequestUser,
  ): Promise<DataRetentionPolicyDto> {
    return this.commandBus.execute(new UpsertDataRetentionPolicyCommand(user.id, organizationId, dto));
  }

  @Delete('retention-policies/:resourceType')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a data retention policy (Admin+)' })
  async deleteRetentionPolicy(
    @Param('organizationId') organizationId: string,
    @Param('resourceType') resourceType: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.commandBus.execute(new DeleteDataRetentionPolicyCommand(user.id, organizationId, resourceType));
  }

  @Get('backup-policy')
  @ApiOperation({ summary: 'Get the organization backup policy, if configured' })
  getBackupPolicy(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<BackupPolicyDto | null> {
    return this.queryBus.execute(new GetBackupPolicyQuery(user.id, organizationId));
  }

  @Put('backup-policy')
  @ApiOperation({ summary: 'Create or update the organization backup policy (Admin+)' })
  upsertBackupPolicy(
    @Param('organizationId') organizationId: string,
    @Body() dto: UpsertBackupPolicyDto,
    @CurrentUser() user: RequestUser,
  ): Promise<BackupPolicyDto> {
    return this.commandBus.execute(new UpsertBackupPolicyCommand(user.id, organizationId, dto));
  }

  @Get('exports')
  @ApiOperation({ summary: 'List compliance export requests' })
  listExports(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ComplianceExportRequestDto[]> {
    return this.queryBus.execute(new ListComplianceExportRequestsQuery(user.id, organizationId));
  }

  @Post('exports')
  @ApiOperation({ summary: 'Request a compliance data export (Admin+) — processed asynchronously' })
  createExport(
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateComplianceExportDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ComplianceExportRequestDto> {
    return this.commandBus.execute(new CreateComplianceExportRequestCommand(user.id, organizationId, dto.scope ?? {}));
  }

  @Get('exports/:id')
  @ApiOperation({ summary: 'Get a compliance export request, including its downloadUrl once READY' })
  getExport(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ComplianceExportRequestDto> {
    return this.queryBus.execute(new GetComplianceExportRequestQuery(user.id, organizationId, id));
  }
}
