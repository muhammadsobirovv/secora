import { KeyRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";

export default function ApiKeysSettingsPage() {
  return (
    <Card>
      <CardContent className="pt-6">
        <EmptyState
          icon={KeyRound}
          title="API keys are coming soon"
          description="CLI, browser extension, and automation access will be issued here in a future module."
        />
      </CardContent>
    </Card>
  );
}
