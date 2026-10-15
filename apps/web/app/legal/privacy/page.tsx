import type { Metadata } from "next";
import { LegalDocumentView } from "@/features/legal/legal-document-view";

// DRAFT: requires review by a qualified Uzbekistan lawyer before launch.
export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What personal data Secora AI processes, why, and your rights.",
  alternates: { canonical: "https://secora.group/legal/privacy" },
};

export default function Page() {
  return <LegalDocumentView kind="privacy" />;
}
