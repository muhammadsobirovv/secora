"use client";

import * as React from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import * as authApi from "@/lib/api/auth";
import { useAuth } from "@/features/auth/hooks/use-auth";
import type { MfaSetupResponseDto } from "@pentesthub/shared";

type Step = "idle" | "setup" | "confirm-disable";

export function MfaSection() {
  const { user } = useAuth();
  const [step, setStep] = React.useState<Step>("idle");
  const [setupData, setSetupData] = React.useState<MfaSetupResponseDto | null>(null);
  const [code, setCode] = React.useState("");
  const [backupCodes, setBackupCodes] = React.useState<string[] | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function startSetup() {
    setBusy(true);
    try {
      const data = await authApi.mfaSetup();
      setSetupData(data);
      setStep("setup");
    } catch {
      toast.error("Couldn't start MFA setup.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup() {
    setBusy(true);
    try {
      const res = await authApi.mfaConfirm({ code });
      setBackupCodes(res.backupCodes);
      setStep("idle");
      toast.success("Two-factor authentication enabled");
    } catch {
      toast.error("Invalid code. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      await authApi.mfaDisable({ code });
      setStep("idle");
      setCode("");
      toast.success("Two-factor authentication disabled");
    } catch {
      toast.error("Invalid code. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Two-factor authentication</CardTitle>
        <CardDescription>Add an authenticator app as a second sign-in factor.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {step === "idle" && (
          <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
            <div className="flex items-center gap-2 text-sm">
              {user?.mfaEnabled ? (
                <>
                  <ShieldCheck className="size-4 text-success" /> Enabled
                </>
              ) : (
                <>
                  <ShieldOff className="size-4 text-muted-foreground" /> Not enabled
                </>
              )}
            </div>
            {user?.mfaEnabled ? (
              <Button variant="outline" size="sm" onClick={() => setStep("confirm-disable")}>
                Disable
              </Button>
            ) : (
              <Button size="sm" onClick={() => void startSetup()} disabled={busy}>
                {busy && <Loader2 className="size-3.5 animate-spin" />}
                Enable
              </Button>
            )}
          </div>
        )}

        {step === "setup" && setupData && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Scan this QR code with your authenticator app, then enter the 6-digit code.
            </p>
            <Image
              src={setupData.qrCodeDataUrl}
              alt="MFA QR code"
              width={180}
              height={180}
              unoptimized
              className="rounded-md border border-border"
            />
            <p className="font-mono text-xs break-all text-muted-foreground">{setupData.secret}</p>
            <div className="flex max-w-xs items-end gap-2">
              <div className="flex-1 space-y-2">
                <Label htmlFor="mfa-code">Code</Label>
                <Input
                  id="mfa-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                  inputMode="numeric"
                />
              </div>
              <Button onClick={() => void confirmSetup()} disabled={busy || code.length < 6}>
                {busy && <Loader2 className="size-3.5 animate-spin" />}
                Confirm
              </Button>
            </div>
            <Button variant="ghost" size="sm" className="self-start" onClick={() => setStep("idle")}>
              Cancel
            </Button>
          </div>
        )}

        {step === "confirm-disable" && (
          <div className="flex max-w-xs items-end gap-2">
            <div className="flex-1 space-y-2">
              <Label htmlFor="mfa-disable-code">Enter a code to disable</Label>
              <Input
                id="mfa-disable-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456 or backup code"
              />
            </div>
            <Button variant="destructive" onClick={() => void disable()} disabled={busy || !code}>
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              Disable
            </Button>
          </div>
        )}
      </CardContent>

      <AlertDialog open={Boolean(backupCodes)} onOpenChange={() => setBackupCodes(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save your backup codes</AlertDialogTitle>
            <AlertDialogDescription>
              Store these somewhere safe. Each code can be used once if you lose access to your
              authenticator app. They won&apos;t be shown again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-4 font-mono text-sm">
            {backupCodes?.map((c) => <span key={c}>{c}</span>)}
          </div>
          <AlertDialogFooter>
            <Button onClick={() => setBackupCodes(null)}>Done</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
