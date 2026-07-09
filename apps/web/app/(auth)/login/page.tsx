import { Suspense } from "react";
import { LoginForm } from "@/features/auth/components/login-form";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
