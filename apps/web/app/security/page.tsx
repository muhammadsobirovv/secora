import type { Metadata } from "next";
import { LegalDocumentView } from "@/features/legal/legal-document-view";

// Vulnerability Disclosure Policy. Machine-readable contact details live in
// public/.well-known/security.txt (RFC 9116).
// DRAFT: requires review by a qualified Uzbekistan lawyer before launch.
export const metadata: Metadata = {
  title: "Security & Vulnerability Disclosure",
  description: "How to report a security vulnerability in PentestHub AI and what to expect.",
  alternates: { canonical: "https://secora.group/security" },
};

export default function Page() {
  return <LegalDocumentView kind="security" />;
}
