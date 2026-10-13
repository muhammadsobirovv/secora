import type { Metadata } from "next";
import localFont from "next/font/local";
import { getLocale } from "@/features/i18n/server";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://pentesthubai.com"),
  title: {
    default: "PentestHub AI — AI-Powered Offensive Security Platform",
    template: "%s | PentestHub AI",
  },
  description:
    "Enterprise-grade pentesting and bug bounty platform: recon, vulnerability scanning, bug bounty workflow, and an AI security copilot in one workspace.",
  openGraph: {
    siteName: "PentestHub AI",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Cookie -> Accept-Language -> "en". Reading request data makes every
  // page render per request, which is what a per-visitor language needs.
  const locale = await getLocale();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <Providers initialLocale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
