"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "../hooks/use-auth";
import { mfaChallengeSchema, type MfaChallengeFormValues } from "../validators/auth.schemas";
import * as authApi from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

const CHALLENGE_TOKEN_KEY = "secora_mfa_challenge_token";

export function MfaChallengeForm() {
  const router = useRouter();
  const { completeLogin } = useAuth();
  const [submitting, setSubmitting] = React.useState(false);
  const [challengeToken, setChallengeToken] = React.useState<string | null>(null);

  React.useEffect(() => {
    const token = sessionStorage.getItem(CHALLENGE_TOKEN_KEY);
    if (!token) {
      router.replace("/login");
      return;
    }
    setChallengeToken(token);
  }, [router]);

  const form = useForm<MfaChallengeFormValues>({
    resolver: zodResolver(mfaChallengeSchema),
    defaultValues: { code: "" },
  });

  async function onSubmit(values: MfaChallengeFormValues) {
    if (!challengeToken) return;
    setSubmitting(true);
    try {
      const tokens = await authApi.mfaChallenge({
        mfaChallengeToken: challengeToken,
        code: values.code,
      });
      sessionStorage.removeItem(CHALLENGE_TOKEN_KEY);
      await completeLogin(tokens);
      router.push("/dashboard");
    } catch (error) {
      if (error instanceof ApiError && error.code === "MFA_CHALLENGE_EXPIRED") {
        toast.error("This challenge expired. Please sign in again.");
        sessionStorage.removeItem(CHALLENGE_TOKEN_KEY);
        router.push("/login");
      } else {
        toast.error("Invalid code. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader className="items-center text-center">
        <KeyRound className="size-10 text-primary" />
        <CardTitle>Two-factor authentication</CardTitle>
        <CardDescription>Enter the 6-digit code from your authenticator app, or a backup code.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="code" className="sr-only">
              Code
            </Label>
            <Input
              id="code"
              autoComplete="one-time-code"
              inputMode="numeric"
              placeholder="123456"
              className="text-center text-lg tracking-widest"
              autoFocus
              {...form.register("code")}
            />
            {form.formState.errors.code && (
              <p className="text-xs text-destructive">{form.formState.errors.code.message}</p>
            )}
          </div>
          <Button type="submit" disabled={submitting || !challengeToken}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Verify
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
