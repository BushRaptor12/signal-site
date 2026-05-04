import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { getAdsenseConfig } from "@/app/lib/adsense";
import { DEFAULT_OG_IMAGE, SITE_DESCRIPTION, SITE_NAME, getSiteUrl } from "@/app/lib/seo";
import SiteUtilities from "@/app/site-utilities";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  applicationName: SITE_NAME,
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
  },
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    images: [
      {
        url: DEFAULT_OG_IMAGE,
        alt: SITE_NAME,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const adsense = getAdsenseConfig();
  const siteUrl = getSiteUrl().toString();
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: siteUrl,
    description: SITE_DESCRIPTION,
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: siteUrl,
      logo: {
        "@type": "ImageObject",
        url: new URL("/small logo.png", siteUrl).toString(),
      },
    },
  };

  return (
    <html lang="en">
      <head>
        {adsense ? <meta name="google-adsense-account" content={adsense.metaContent} /> : null}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
      </head>
      <body className={`${inter.className} ${inter.variable} flex min-h-screen flex-col`}>
        <SiteUtilities />
        <div className="flex-1">{children}</div>
        <footer className="border-t border-[#0d2438] bg-[var(--surface)] px-6 py-4 text-center text-sm text-neutral-400">
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <span>&copy; 2026 The Beacon. All rights reserved.</span>
            <Link href="/about" className="text-neutral-300 transition hover:text-white">
              About
            </Link>
            <Link href="/privacy" className="text-neutral-300 transition hover:text-white">
              Privacy Policy
            </Link>
            <a href="mailto:contact@readthebeacon.news" className="text-neutral-300 transition hover:text-white">
              Contact
            </a>
          </div>
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
