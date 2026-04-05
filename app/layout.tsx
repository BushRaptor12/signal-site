import "./globals.css";
import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  title: {
    default: "The Beacon",
    template: "%s | The Beacon",
  },
  description: "Multi-source news. Clear perspective.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <div className="flex-1">{children}</div>
        <footer className="border-t border-[#0d2438] bg-[var(--surface)] px-6 py-4 text-center text-sm text-neutral-400">
          &copy; 2026 The Beacon. All rights reserved.
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
