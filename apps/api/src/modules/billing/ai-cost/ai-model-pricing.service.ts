import { Injectable } from '@nestjs/common';
import type {
  AiModelPricingDto,
  AiProviderName,
  EstimateAiCostRequestDto,
  EstimateAiCostResponseDto,
} from '@pentesthub/shared';
import { PrismaService } from '../../../prisma/prisma.service.js';

/// Module 15 — AI cost control (task #340). Wraps the `AiModelPricing`
/// table (task #325's schema addition) — per-(provider, model) list
/// prices in cents-per-million-tokens, so cost math never hardcodes
/// dollar amounts in TypeScript and an operator can update a provider's
/// pricing with a data change, not a deploy. `OLLAMA` rows are meant to be
/// seeded at 0/0 (see seed-ai-pricing.ts) since a local model has no
/// metered cost — `estimateCostCents()` naturally returns 0 for those
/// without any special-casing.
@Injectable()
export class AiModelPricingService {
  constructor(private readonly prisma: PrismaService) {}

  /// Not a DB-level `.upsert()` on a compound unique key with no nullable
  /// column here — `@@unique([provider, model])`, both required, so a
  /// real Prisma `.upsert()` works cleanly (unlike the nullable-scopeId
  /// cases elsewhere in this module that need findFirst+create/update).
  async setPricing(input: AiModelPricingDto): Promise<AiModelPricingDto> {
    const row = await this.prisma.aiModelPricing.upsert({
      where: { provider_model: { provider: input.provider as never, model: input.model } },
      create: {
        provider: input.provider as never,
        model: input.model,
        inputCentsPerMillionTokens: input.inputCentsPerMillionTokens,
        outputCentsPerMillionTokens: input.outputCentsPerMillionTokens,
      },
      update: {
        inputCentsPerMillionTokens: input.inputCentsPerMillionTokens,
        outputCentsPerMillionTokens: input.outputCentsPerMillionTokens,
      },
    });
    return this.toDto(row);
  }

  async list(): Promise<AiModelPricingDto[]> {
    const rows = await this.prisma.aiModelPricing.findMany({ orderBy: [{ provider: 'asc' }, { model: 'asc' }] });
    return rows.map((row) => this.toDto(row));
  }

  async getPricing(provider: string, model: string): Promise<AiModelPricingDto | null> {
    const row = await this.prisma.aiModelPricing.findUnique({
      where: { provider_model: { provider: provider as never, model } },
    });
    return row ? this.toDto(row) : null;
  }

  /// `priceKnown: false` (estimate of `0`) for any (provider, model) pair
  /// with no `AiModelPricing` row — deliberately NOT treated as "this
  /// call is free" by callers (`AiBudgetEnforcerService`); see this
  /// interface's own doc comment in ai-cost-control.ts.
  async estimateCostCents(request: EstimateAiCostRequestDto): Promise<EstimateAiCostResponseDto> {
    const pricing = await this.getPricing(request.provider, request.model);
    if (!pricing) return { estimatedCostCents: 0, priceKnown: false };
    const inputCost = (request.estimatedInputTokens / 1_000_000) * pricing.inputCentsPerMillionTokens;
    const outputCost = (request.estimatedOutputTokens / 1_000_000) * pricing.outputCentsPerMillionTokens;
    return { estimatedCostCents: Math.round(inputCost + outputCost), priceKnown: true };
  }

  /// Suggests a cheaper configured model for the same provider — the
  /// "model fallback" half of task #340. Cheapness is ranked by output
  /// price (the more expensive of the two token directions for almost
  /// every provider's pricing table), excluding the model already in use.
  /// Returns `null` when there's no known-cheaper alternative (e.g. only
  /// one model priced for that provider, or no pricing data at all) —
  /// callers must treat that as "nothing to fall back to," not an error.
  async findCheaperAlternative(provider: AiProviderName, currentModel: string): Promise<{ provider: string; model: string } | null> {
    const current = await this.getPricing(provider, currentModel);
    const candidates = await this.prisma.aiModelPricing.findMany({
      where: { provider: provider as never, model: { not: currentModel } },
      orderBy: { outputCentsPerMillionTokens: 'asc' },
    });
    const cheaper = candidates.find(
      (candidate) => current == null || candidate.outputCentsPerMillionTokens < current.outputCentsPerMillionTokens,
    );
    if (!cheaper) return null;
    return { provider: cheaper.provider, model: cheaper.model };
  }

  private toDto(row: {
    provider: string;
    model: string;
    inputCentsPerMillionTokens: number;
    outputCentsPerMillionTokens: number;
  }): AiModelPricingDto {
    return {
      provider: row.provider,
      model: row.model,
      inputCentsPerMillionTokens: row.inputCentsPerMillionTokens,
      outputCentsPerMillionTokens: row.outputCentsPerMillionTokens,
    };
  }
}
