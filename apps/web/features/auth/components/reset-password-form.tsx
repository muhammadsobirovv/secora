"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { resetPasswordSchema, type ResetPasswordFormValues } from "../validators/auth.schemas";
import * as authApi from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

export function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [submitting, setSubmitting] = React.useState(false);
  const [done, setDone] = React.useState(false);

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  async function onSubmit(values: ResetPasswordFormValues) {
    if (!token) {
      toast.error("Missing or invalid reset link.");
      return;
    }
    setSubmitting(true);
    try {
      await authApi.resetPassword({ token, newPassword: values.newPassword });
      setDone(true);
    } catch (error) {
      if (error instanceof ApiError && error.code === "INVALID_OR_EXPIRED_TOKEN") {
        toast.error("This reset link has expired. Request a new one.");
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <CheckCircle2 className="size-10 text-success" />
          <CardTitle>Password reset</CardTitle>
          <CardDescription>All other sessions have been signed out for your security.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={() => router.push("/login")}>
            Sign in
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>Choose a new password for your account.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="newPassword">New password</Label>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              {...form.register("newPassword")}
            />
            {form.formState.errors.newPassword && (
              <p className="text-xs text-destructive">{form.formState.errors.newPassword.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              {...form.register("confirmPassword")}
            />
            {form.formState.errors.confirmPassword && (
              <p className="text-xs text-destructive">
                {form.formState.errors.confirmPassword.message}
              </p>
            )}
          </div>
          <Button type="submit" disabled={submitting || !token}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Reset password
          </Button>
          <Link href="/login" className="text-center text-sm text-muted-foreground hover:text-foreground">
            Back to sign in
          </Link>
        </form>
      </CardContent>
    </Card>
  );
}
