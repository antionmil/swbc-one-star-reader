import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? "SWBC site";

export const metadata: Metadata = {
  title: NAME,
  description: "One website a day, built in public, all September.",
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
