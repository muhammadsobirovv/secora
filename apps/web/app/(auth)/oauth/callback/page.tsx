import { Suspense } from "react";
import { OAuthCallbackHandler } from "@/features/auth/components/oauth-callback-handler";

export default function OAuthCallbackPage() {
  return (
    <Suspense>
      <OAuthCallbackHandler />
    </Suspense>
  );
}
