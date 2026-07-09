import { ChangePasswordForm } from "@/features/settings/components/change-password-form";
import { MfaSection } from "@/features/settings/components/mfa-section";

export default function SecuritySettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <ChangePasswordForm />
      <MfaSection />
    </div>
  );
}
