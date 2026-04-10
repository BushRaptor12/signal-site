import Link from "next/link";
import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE, SITE_NAME } from "@/app/lib/seo";

export const metadata: Metadata = {
  title: "Account",
  description: "Account features for The Beacon.",
  alternates: {
    canonical: "/account",
  },
  openGraph: {
    type: "website",
    url: "/account",
    title: `Account | ${SITE_NAME}`,
    description: "Account features for The Beacon.",
    siteName: SITE_NAME,
    images: [
      {
        url: DEFAULT_OG_IMAGE,
        alt: "The Beacon",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `Account | ${SITE_NAME}`,
    description: "Account features for The Beacon.",
    images: [DEFAULT_OG_IMAGE],
  },
};

export default function AccountPage() {
  return (
    <main className="min-h-screen bg-transparent px-6 py-12 text-neutral-100">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="text-neutral-300 transition hover:text-white">
          {"<- Back"}
        </Link>

        <div className="mt-8 rounded-2xl border border-[#0d2438] bg-[var(--surface)] p-8 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
          <div className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">Account</div>
          <h1 className="mt-3 text-4xl font-semibold text-neutral-100">Account features are on the way</h1>
          <p className="mt-6 text-base leading-7 text-neutral-300">
            The Beacon is preparing account tools for saved preferences, synced alerts, and more personalized reader features.
          </p>
          <p className="mt-4 text-base leading-7 text-neutral-400">
            For now, notification settings are available on this device through the Notifications page.
          </p>
          <div className="mt-8">
            <Link
              href="/notifications"
              className="inline-flex rounded-full border border-[#0d2438] bg-[#020b14] px-5 py-2 text-sm text-[#d7e2ef] transition hover:border-[#163754] hover:bg-[#03101b]"
            >
              Manage notifications
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
