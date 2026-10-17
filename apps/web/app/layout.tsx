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

const SITE_TITLE = "Secora — Offensive Security Scanner";
const SITE_DESCRIPTION =
  "Know if your site can be hacked, in minutes. Add your website: Secora scans it, shows what's wrong, and explains how to fix it with AI.";

export const metadata: Metadata = {
  metadataBase: new URL("https://secora.group"),
  title: {
    default: SITE_TITLE,
    template: "%s | Secora",
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    siteName: "Secora",
    type: "website",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "https://secora.group",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Secora" }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/og-image.png"],
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
    <html lang={locale} data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <Providers initialLocale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
