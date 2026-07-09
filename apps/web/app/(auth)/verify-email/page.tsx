import { Suspense } from "react";
import { VerifyEmailStatus } from "@/features/auth/components/verify-email-status";

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailStatus />
    </Suspense>
  );
}
