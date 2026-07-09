"use client";

import * as React from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { forgotPasswordSchema, type ForgotPasswordFormValues } from "../validators/auth.schemas";
import * as authApi from "@/lib/api/auth";

export function ForgotPasswordForm() {
  const [submitting, setSubmitting] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: ForgotPasswordFormValues) {
    setSubmitting(true);
    try {
      await authApi.requestPasswordReset(values);
      setSent(true);
    } catch {
      // Deliberately never reveals whether the email exists — always
      // show the same success state (mirrors the backend's own
      // enumeration-safe behavior for this endpoint).
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <MailCheck className="size-10 text-primary" />
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            If an account exists for that address, a reset link is on its way.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" className="w-full" asChild>
            <Link href="/login">Back to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Forgot password</CardTitle>
        <CardDescription>We&apos;ll email you a link to reset it.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
            {form.formState.errors.email && (
              <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
            )}
          </div>
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Send reset link
          </Button>
          <Link href="/login" className="text-center text-sm text-muted-foreground hover:text-foreground">
            Back to sign in
          </Link>
        </form>
      </CardContent>
    </Card>
  );
}
