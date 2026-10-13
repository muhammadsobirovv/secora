import type { Metadata } from "next";
import { LegalDocumentView } from "@/features/legal/legal-document-view";

// DRAFT: requires review by a qualified Uzbekistan lawyer before launch.
export const metadata: Metadata = {
  title: "Acceptable Use Policy",
  description: "What you may and may not do with PentestHub AI, including the Rules of Engagement.",
  alternates: { canonical: "https://secora.group/legal/acceptable-use" },
};

export default function Page() {
  return <LegalDocumentView kind="aup" />;
}
