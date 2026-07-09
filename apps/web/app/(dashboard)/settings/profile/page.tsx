"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/features/auth/hooks/use-auth";

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export default function ProfileSettingsPage() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Your account details.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <Avatar className="size-16">
            <AvatarFallback className="text-lg">{initials(user.displayName)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-lg font-medium">{user.displayName}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <span className="text-sm">Email verified</span>
            {user.emailVerified ? (
              <Badge variant="success">
                <CheckCircle2 className="size-3" /> Verified
              </Badge>
            ) : (
              <Badge variant="outline">
                <XCircle className="size-3" /> Not verified
              </Badge>
            )}
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <span className="text-sm">Two-factor authentication</span>
            {user.mfaEnabled ? (
              <Badge variant="success">
                <CheckCircle2 className="size-3" /> Enabled
              </Badge>
            ) : (
              <Badge variant="outline">Disabled</Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
