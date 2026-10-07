import type { Metadata } from "next";
import { Suspense } from "react";
import { LegalAcceptScreen } from "@/features/legal/legal-accept-screen";

export const metadata: Metadata = {
  title: "Updated terms",
  robots: { index: false, follow: false },
};

// Suspense boundary: LegalAcceptScreen reads ?next= via useSearchParams.
export default function Page() {
  return (
    <Suspense>
      <LegalAcceptScreen />
    </Suspense>
  );
}
