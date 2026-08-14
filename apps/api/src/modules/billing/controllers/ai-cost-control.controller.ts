import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  AiBudgetPolicyDto,
  AiModelPricingDto,
  CreateAiBudgetPolicyRequestDto,
  EstimateAiCostRequestDto,
  EstimateAiCostResponseDto,
} from '@pentesthub/shared';
import { Roles } from '../../../common/decorators/roles.decorator.js';
import { AiModelPricingService } from '../ai-cost/ai-model-pricing.service.js';
import { AiBudgetEnforcerService } from '../ai-cost/ai-budget-enforcer.service.js';

/// Module 15 — AI cost control (task #340). Same "platform operator, not
/// per-organization admin" posture as `QuotaController` — pricing and
/// budget policy defaults are set once for the whole deployment (or a
/// specific scope), not something each organization's own billing admin
/// manages, so this reuses `@Roles('ADMIN')`/`RolesGuard` rather than
/// `requireEnterpriseRole`. See `QuotaController`'s doc comment for the
/// full reasoning.
@ApiTags('ai-cost-control')
@ApiBearerAuth()
@Controller('ai-cost-control')
@Roles('ADMIN')
export class AiCostControlController {
  constructor(
    private readonly pricing: AiModelPricingService,
    private readonly budgets: AiBudgetEnforcerService,
  ) {}

  @Get('pricing')
  @ApiOperation({ summary: 'List all configured AI model pricing rows (platform operator only)' })
  listPricing(): Promise<AiModelPricingDto[]> {
    return this.pricing.list();
  }

  @Post('pricing')
  @ApiOperation({ summary: 'Set (create or update) the pricing for a (provider, model) pair (platform operator only)' })
  setPricing(@Body() dto: AiModelPricingDto): Promise<AiModelPricingDto> {
    return this.pricing.setPricing(dto);
  }

  @Post('pricing/estimate')
  @ApiOperation({ summary: 'Estimate the cost in cents of a hypothetical AI call, given token counts' })
  estimate(@Body() dto: EstimateAiCostRequestDto): Promise<EstimateAiCostResponseDto> {
    return this.pricing.estimateCostCents(dto);
  }

  @Get('budget-policies')
  @ApiOperation({ summary: 'List AI budget policies (platform operator only)' })
  listPolicies(): Promise<AiBudgetPolicyDto[]> {
    return this.budgets.listPolicies();
  }

  @Post('budget-policies')
  @ApiOperation({ summary: 'Create or update the AI budget policy for a given scope key (platform operator only)' })
  createPolicy(@Body() dto: CreateAiBudgetPolicyRequestDto): Promise<AiBudgetPolicyDto> {
    return this.budgets.createPolicy(dto);
  }

  @Delete('budget-policies/:id')
  @ApiOperation({ summary: 'Delete an AI budget policy — the scope falls back to the next-least-specific policy (platform operator only)' })
  deletePolicy(@Param('id') id: string): Promise<void> {
    return this.budgets.deletePolicy(id);
  }
}
