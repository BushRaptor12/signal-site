import Link from "next/link";
import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE, SITE_NAME } from "@/app/lib/seo";

export const metadata: Metadata = {
  title: "About",
  description: "About The Beacon.",
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    type: "article",
    url: "/about",
    title: `About | ${SITE_NAME}`,
    description: "About The Beacon.",
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
    title: `About | ${SITE_NAME}`,
    description: "About The Beacon.",
    images: [DEFAULT_OG_IMAGE],
  },
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-transparent px-6 py-12 text-neutral-100">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="text-neutral-300 transition hover:text-white">
          {"<- Back"}
        </Link>

        <div className="mt-8 rounded-2xl border border-[#0d2438] bg-[var(--surface)] p-8 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
          <div className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">About</div>
          <h1 className="mt-3 text-4xl font-semibold text-neutral-100">About The Beacon</h1>
          <p className="mt-6 text-base leading-7 text-neutral-300">
            This page is reserved for your site background, editorial mission, and who is behind The Beacon.
          </p>
          <p className="mt-4 text-base leading-7 text-neutral-400">
            Add your story here when you&apos;re ready.
          </p>
        </div>
      </div>
    </main>
  );
}
