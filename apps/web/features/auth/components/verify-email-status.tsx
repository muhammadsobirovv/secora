"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import * as authApi from "@/lib/api/auth";

type Status = "verifying" | "success" | "error";

export function VerifyEmailStatus() {
  const token = useSearchParams().get("token");
  const [status, setStatus] = React.useState<Status>("verifying");

  React.useEffect(() => {
    if (!token) {
      setStatus("error");
      return;
    }
    authApi
      .verifyEmail(token)
      .then(() => setStatus("success"))
      .catch(() => setStatus("error"));
  }, [token]);

  return (
    <Card>
      <CardHeader className="items-center text-center">
        {status === "verifying" && <Loader2 className="size-10 animate-spin text-primary" />}
        {status === "success" && <CheckCircle2 className="size-10 text-success" />}
        {status === "error" && <XCircle className="size-10 text-destructive" />}
        <CardTitle>
          {status === "verifying" && "Verifying your email…"}
          {status === "success" && "Email verified"}
          {status === "error" && "Verification failed"}
        </CardTitle>
        <CardDescription>
          {status === "success" && "Your account is fully set up."}
          {status === "error" && "This link is invalid or has expired."}
        </CardDescription>
      </CardHeader>
      {status !== "verifying" && (
        <CardContent>
          <Button className="w-full" asChild>
            <Link href="/login">Continue to sign in</Link>
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
