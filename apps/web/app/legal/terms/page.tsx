import type { Metadata } from "next";
import { LegalDocumentView } from "@/features/legal/legal-document-view";

// DRAFT: requires review by a qualified Uzbekistan lawyer before launch.
export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The rules for using PentestHub AI, an authorized security testing platform.",
  alternates: { canonical: "https://pentesthubai.com/legal/terms" },
};

export default function Page() {
  return <LegalDocumentView kind="terms" />;
}
