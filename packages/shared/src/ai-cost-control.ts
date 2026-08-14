// Module 15 — AI cost control (task #340).
// See docs/adr/0015-production-hardening-monetization-marketplace.md.

import type { QuotaScopeType } from "./usage-metering.js";

export interface AiModelPricingDto {
  provider: string;
  model: string;
  inputCentsPerMillionTokens: number;
  outputCentsPerMillionTokens: number;
}

export interface AiBudgetPolicyDto {
  id: string;
  scopeType: QuotaScopeType;
  scopeId: string | null;
  planTier: string | null;
  dailyTokenLimit: number | null;
  monthlyTokenLimit: number | null;
  dailyCostCentsLimit: number | null;
  monthlyCostCentsLimit: number | null;
  hardStop: boolean;
}

export interface CreateAiBudgetPolicyRequestDto {
  scopeType: QuotaScopeType;
  scopeId?: string;
  planTier?: string;
  dailyTokenLimit?: number;
  monthlyTokenLimit?: number;
  dailyCostCentsLimit?: number;
  monthlyCostCentsLimit?: number;
  hardStop?: boolean;
}

export interface EstimateAiCostRequestDto {
  provider: string;
  model: string;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
}

export interface EstimateAiCostResponseDto {
  estimatedCostCents: number;
  /// `false` when the (provider, model) pair has no `AiModelPricing` row
  /// — the estimate is then `0` and callers should not treat that as
  /// "this call is free," just "we don't have list-price data for it
  /// yet" (always true for self-hosted local models, by design).
  priceKnown: boolean;
}

/// `AiBudgetEnforcer.check()`'s result — checked before every AI
/// provider call in `apps/api/src/modules/ai/services/ai-chat.service.ts`
/// (and equivalent Agent SDK / Script Engine `ai.invoke`/`ai:invoke`
/// call sites). `fallbackSuggested` is populated when a cheaper/local
/// provider is configured for the same workspace and could serve the
/// request instead of hard-stopping it.
export interface AiBudgetCheckResultDto {
  allowed: boolean;
  hardStopped: boolean;
  warning: boolean;
  remainingDailyTokens: number | null;
  remainingMonthlyTokens: number | null;
  fallbackSuggested: { provider: string; model: string } | null;
}
