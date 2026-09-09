import { ApiKeysSection } from "@/features/api-keys/components/api-keys-section";

/// Module 20 (#332-class gap, Phase 1 backlog reconciliation). This was a
/// permanent "coming soon" `EmptyState` stub despite the backend
/// (Module 9's `ApiKeysController` + Module 15's rotation/IP-allowlist
/// work, task #336) having been complete and unchanged since — see
/// `docs/reviews/0024-module-20-backlog-reconciliation.md`.
export default function ApiKeysSettingsPage() {
  return <ApiKeysSection />;
}
