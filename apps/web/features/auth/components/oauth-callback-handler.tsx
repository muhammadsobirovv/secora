"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "../hooks/use-auth";
import * as authApi from "@/lib/api/auth";

export function OAuthCallbackHandler() {
  const router = useRouter();
  const code = useSearchParams().get("code");
  const { completeLogin } = useAuth();
  const [failed, setFailed] = React.useState(false);
  const attempted = React.useRef(false);

  React.useEffect(() => {
    if (!code || attempted.current) {
      if (!code) setFailed(true);
      return;
    }
    attempted.current = true;
    authApi
      .oauthExchange(code)
      .then(async (tokens) => {
        await completeLogin(tokens);
        router.push("/dashboard");
      })
      .catch(() => setFailed(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  if (failed) {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <XCircle className="size-10 text-destructive" />
          <CardTitle>Sign-in failed</CardTitle>
          <CardDescription>We couldn&apos;t complete the OAuth sign-in.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={() => router.push("/login")}>
            Back to sign in
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="items-center text-center">
        <Loader2 className="size-10 animate-spin text-primary" />
        <CardTitle>Signing you in…</CardTitle>
      </CardHeader>
    </Card>
  );
}
