import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { CreateQuotaPolicyRequestDto, QuotaPolicyDto, QuotaScopeType } from '@pentesthub/shared';
import { Roles } from '../../../common/decorators/roles.decorator.js';
import { QuotaService } from '../quota.service.js';

/// Module 15 — QuotaController (task #331/#332). `QuotaPolicy` rows can
/// override limits at `PLAN`/`ORGANIZATION`/`WORKSPACE`/`USER` scope —
/// a platform-operator action, not something scoped to one organization's
/// membership (unlike every other controller in this module), so this is
/// the first route in the whole codebase to activate `@Roles(...)` /
/// `RolesGuard` (Module 1 RBAC — wired globally since ADR 0001 but never
/// previously used by any route). `'ADMIN'` here is the platform-wide RBAC
/// role name seeded in `prisma/seed.ts`, distinct from the per-organization
/// `EnterpriseRole.ADMIN` every other Module 15 billing route checks via
/// `requireEnterpriseRole` — a platform operator managing quota policy
/// defaults is a different kind of "admin" than an organization's own
/// billing admin.
@ApiTags('quota')
@ApiBearerAuth()
@Controller('quota/policies')
@Roles('ADMIN')
export class QuotaController {
  constructor(private readonly quotaService: QuotaService) {}

  @Get()
  @ApiOperation({ summary: 'List quota policies, optionally filtered by scope type (platform operator only)' })
  list(@Query('scopeType') scopeType?: QuotaScopeType): Promise<QuotaPolicyDto[]> {
    return this.quotaService.listPolicies(scopeType);
  }

  @Post()
  @ApiOperation({ summary: 'Create or update the quota policy for a given scope/resource/period key (platform operator only)' })
  create(@Body() dto: CreateQuotaPolicyRequestDto): Promise<QuotaPolicyDto> {
    return this.quotaService.createPolicy(dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a quota policy — the scope falls back to the next-least-specific policy (platform operator only)' })
  remove(@Param('id') id: string): Promise<void> {
    return this.quotaService.deletePolicy(id);
  }
}
