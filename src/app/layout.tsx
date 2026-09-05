import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const URL_BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://onestarreader.onedaybuilt.com";

export const metadata: Metadata = {
  metadataBase: new URL(URL_BASE),
  title: {
    default: "One-star reader — what people actually hate about the apps they use",
    template: "%s",
  },
  description:
    "Thousands of one- and two-star App Store reviews, sorted into the complaints that keep coming back. Every count is real and every quote is a real review.",
  openGraph: { type: "website", siteName: "One-star reader", url: URL_BASE },
  twitter: { card: "summary_large_image", creator: "@antionmil" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
