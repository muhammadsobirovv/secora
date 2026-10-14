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
  metadataBase: new URL("https://secora.group"),
  title: {
    default: "Secora — Security Platform",
    template: "%s | Secora",
  },
  description:
    "Secora — red team, blue team va ilova xavfsizligi uchun AI platforma. Recon, skanerlash, SOC va Hisobot barchasi bir joyda.",
  openGraph: {
    siteName: "Secora",
    type: "website",
    title: "Secora — Security Platform",
    description:
      "Secora — red team, blue team va ilova xavfsizligi uchun AI platforma. Recon, skanerlash, SOC va Hisobot barchasi bir joyda.",
    url: "https://secora.group",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Secora" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Secora — Security Platform",
    description:
      "Secora — red team, blue team va ilova xavfsizligi uchun AI platforma. Recon, skanerlash, SOC va Hisobot barchasi bir joyda.",
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
    <html lang={locale} suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <Providers initialLocale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
