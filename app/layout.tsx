import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "LaneForge RFP",
  description: "Customer and carrier-facing RFP bid management SaaS for LTL and FTL freight."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}        <Analytics />
        <SpeedInsights />
      </body>
      </html>
    </ClerkProvider>
  );
}
