import { UsageSummarySection } from "@/features/billing/components/usage-summary-section";

export default function UsageSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <UsageSummarySection />
    </div>
  );
}
