"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { registerSchema, type RegisterFormValues } from "../validators/auth.schemas";
import * as authApi from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { OAuthButtons } from "./oauth-buttons";

export function RegisterForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);
  const [registeredEmail, setRegisteredEmail] = React.useState<string | null>(null);

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { displayName: "", email: "", password: "", confirmPassword: "" },
  });

  async function onSubmit(values: RegisterFormValues) {
    setSubmitting(true);
    try {
      await authApi.register(values);
      setRegisteredEmail(values.email);
    } catch (error) {
      if (error instanceof ApiError && error.code === "EMAIL_ALREADY_REGISTERED") {
        toast.error("An account with this email already exists.");
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (registeredEmail) {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <MailCheck className="size-10 text-primary" />
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            We sent a verification link to <span className="text-foreground">{registeredEmail}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" className="w-full" onClick={() => router.push("/login")}>
            Back to sign in
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>Start your personal workspace in seconds.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="displayName">Name</Label>
            <Input id="displayName" autoComplete="name" {...form.register("displayName")} />
            {form.formState.errors.displayName && (
              <p className="text-xs text-destructive">{form.formState.errors.displayName.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
            {form.formState.errors.email && (
              <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              {...form.register("password")}
            />
            {form.formState.errors.password && (
              <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
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
          <Button type="submit" disabled={submitting} className="mt-2">
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Create account
          </Button>
        </form>
        <OAuthButtons />
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
