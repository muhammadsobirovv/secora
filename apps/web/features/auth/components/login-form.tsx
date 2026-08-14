"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "../hooks/use-auth";
import { loginSchema, type LoginFormValues } from "../validators/auth.schemas";
import * as authApi from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { OAuthButtons } from "./oauth-buttons";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { completeLogin } = useAuth();
  const [submitting, setSubmitting] = React.useState(false);
  const [demoSubmitting, setDemoSubmitting] = React.useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", rememberMe: false },
  });

  async function onSubmit(values: LoginFormValues) {
    setSubmitting(true);
    try {
      const res = await authApi.login(values);
      if (authApi.isMfaRequired(res)) {
        sessionStorage.setItem("pentesthub_mfa_challenge_token", res.mfaChallengeToken);
        router.push("/mfa-challenge");
        return;
      }
      await completeLogin(res);
      router.push(searchParams.get("next") ?? "/");
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(errorMessage(error));
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Module 15 — task #352 (demo mode). A visitor never needs to know
  // whether DEMO_MODE_ENABLED is set on this deployment to see this
  // button — the backend 404s with DEMO_MODE_DISABLED when it's off, and
  // that's the one error message worth distinguishing from "something
  // went wrong."
  async function handleTryDemo() {
    setDemoSubmitting(true);
    try {
      const tokens = await authApi.startDemoSession();
      await completeLogin(tokens);
      router.push("/");
    } catch (error) {
      if (error instanceof ApiError && error.code === "DEMO_MODE_DISABLED") {
        toast.error("Demo mode isn't available on this deployment.");
      } else {
        toast.error("Couldn't start a demo session. Please try again.");
      }
    } finally {
      setDemoSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Welcome back. Sign in to your workspace.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
            {form.formState.errors.email && (
              <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground">
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              {...form.register("password")}
            />
            {form.formState.errors.password && (
              <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="rememberMe" {...form.register("rememberMe")} />
            <Label htmlFor="rememberMe" className="font-normal text-muted-foreground">
              Remember me
            </Label>
          </div>
          <Button type="submit" disabled={submitting} className="mt-2">
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Sign in
          </Button>
        </form>
        <OAuthButtons />
        <Button variant="outline" onClick={handleTryDemo} disabled={demoSubmitting}>
          {demoSubmitting && <Loader2 className="size-4 animate-spin" />}
          Try the demo — no account needed
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="text-primary hover:underline">
            Create one
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

function errorMessage(error: ApiError): string {
  if (error.code === "INVALID_CREDENTIALS") return "Incorrect email or password.";
  if (error.code === "ACCOUNT_LOCKED") return "Account locked due to too many failed attempts.";
  if (error.code === "ACCOUNT_SUSPENDED") return "This account has been suspended.";
  if (error.code === "RATE_LIMITED") return "Too many attempts. Please wait and try again.";
  return error.message;
}
