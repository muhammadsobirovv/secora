"use client";

import { toast } from "sonner";
import { Laptop, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ListSkeleton } from "@/components/common/skeletons";
import { useRevokeSession, useSessions } from "@/features/settings/hooks/use-sessions";
import { formatDateTime } from "@/lib/format";

export default function SessionsSettingsPage() {
  const { data: sessions, isLoading } = useSessions();
  const revokeSession = useRevokeSession();

  async function handleRevoke(sessionId: string) {
    try {
      await revokeSession.mutateAsync(sessionId);
      toast.success("Session revoked");
    } catch {
      toast.error("Couldn't revoke session.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Active sessions</CardTitle>
        <CardDescription>Devices currently signed in to your account.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <ListSkeleton />
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {sessions?.map((session) => (
              <div key={session.id} className="flex items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-3">
                  <Laptop className="size-4 text-muted-foreground" />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{session.deviceName}</p>
                      {session.current && <Badge variant="success">This device</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {session.ipAddress} · Last active {formatDateTime(session.lastActiveAt)}
                    </p>
                  </div>
                </div>
                {!session.current && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleRevoke(session.id)}
                    disabled={revokeSession.isPending}
                  >
                    <LogOut className="size-3.5" /> Revoke
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
