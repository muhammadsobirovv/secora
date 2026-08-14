import { Injectable } from '@nestjs/common';
import { SubscriptionService } from './subscription.service.js';

/// Module 15 — EntitlementService (task #331). Answers "can this
/// organization use feature X" purely from `Plan.features` — never a
/// hardcoded per-plan `if (tier === 'TEAM')` check scattered across
/// unrelated controllers. Distinct from `QuotaService` (which answers
/// "how much of resource Y has this scope consumed") and from
/// `FeatureFlagService` (Module 15 task #357 — global/beta/edition
/// rollout toggles, not plan-tier feature gating); this is specifically
/// "what does the organization's *plan* unlock."
@Injectable()
export class EntitlementService {
  constructor(private readonly subscriptions: SubscriptionService) {}

  async isEntitled(organizationId: string, featureKey: string): Promise<boolean> {
    const subscription = await this.subscriptions.getOrCreate(organizationId);
    const value = (subscription.plan.features as Record<string, unknown>)[featureKey];
    return value === true;
  }

  async getFeatureValue(organizationId: string, featureKey: string): Promise<boolean | string | number | undefined> {
    const subscription = await this.subscriptions.getOrCreate(organizationId);
    return (subscription.plan.features as Record<string, boolean | string | number>)[featureKey];
  }

  async getAllFeatures(organizationId: string): Promise<Record<string, boolean | string | number>> {
    const subscription = await this.subscriptions.getOrCreate(organizationId);
    return subscription.plan.features as Record<string, boolean | string | number>;
  }
}
