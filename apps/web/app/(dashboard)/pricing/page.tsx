import { PlanPickerSection } from "@/features/billing/components/plan-picker-section";

/// Module 19 (#332). Lives inside the authenticated `(dashboard)` route
/// group, not as a public marketing page — this app has no public/
/// unauthenticated marketing surface today (only `/docs` is public; see
/// `nav-config.ts`'s comment on that route), and `GET billing/plans`
/// itself sits behind the platform's global auth guard. Making Pricing
/// reachable by a logged-out visitor would mean adding a new public
/// route type and a `@Public()`-equivalent carve-out on the plans
/// endpoint — real, disclosed scope left for a dedicated marketing-site
/// pass rather than done as a side effect here.
export default function PricingPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Pricing</h1>
        <p className="text-sm text-muted-foreground">
          Choose a plan for your organization. Community Edition (self-hosted, no organization) is
          always free with no limits imposed by this platform.
        </p>
      </div>
      <PlanPickerSection />
    </div>
  );
}
