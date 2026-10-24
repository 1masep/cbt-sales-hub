import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import { BRAND } from "../lib/brand";
import "./globals.css";

// Text uses the device's own UI font (Segoe UI on Windows, like the website's
// headings); invoice numbers and SKUs use a monospace so characters line up.
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: `Sales · ${BRAND.name}`,
  description: "Every sale, in one sheet.",
  robots: { index: false, follow: false },
  icons: { icon: BRAND.logo(64) },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={mono.variable}>
      <body>{children}</body>
    </html>
  );
}
