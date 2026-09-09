import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { DEFAULT_PLAN_SEEDS } from "@pentesthub/shared";

/// Module 15 — Monetization (task #331/#332). Populates the `Plan` table
/// from `DEFAULT_PLAN_SEEDS` (`packages/shared/src/plan-defaults.ts`),
/// the single source of truth both this script and
/// `SubscriptionService`/`EntitlementService`'s in-memory fallbacks read
/// from. Idempotent — safe to re-run after editing seed values; existing
/// rows are updated in place by `tier` (the `Plan.tier` unique
/// constraint), never duplicated. Run with `pnpm --filter api run
/// seed:plans` against a database that already has migrations applied.
/// Every Community Edition deployment needs this run at least once (the
/// FREE plan row `SubscriptionService.getOrCreate()` depends on) — see
/// the "Getting Started" section of README.md.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main(): Promise<void> {
  for (const seed of Object.values(DEFAULT_PLAN_SEEDS)) {
    const plan = await prisma.plan.upsert({
      where: { tier: seed.tier },
      create: {
        tier: seed.tier,
        name: seed.name,
        description: seed.description,
        priceMonthlyCents: seed.priceMonthlyCents,
        priceYearlyCents: seed.priceYearlyCents,
        currency: seed.currency,
        limits: seed.limits as Prisma.InputJsonValue,
        features: seed.features,
        isActive: seed.isActive,
      },
      update: {
        name: seed.name,
        description: seed.description,
        priceMonthlyCents: seed.priceMonthlyCents,
        priceYearlyCents: seed.priceYearlyCents,
        currency: seed.currency,
        limits: seed.limits as Prisma.InputJsonValue,
        features: seed.features,
        isActive: seed.isActive,
      },
    });
    // eslint-disable-next-line no-console
    console.log(`Seeded plan ${plan.tier} ("${plan.name}")`);
  }
}

main()
  .catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error("Failed to seed plans:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
