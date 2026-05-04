import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import BackLink from "@/app/back-link";
import { listBriefingArchives } from "@/app/lib/briefing-archive";
import { DEFAULT_OG_IMAGE, SITE_NAME, breadcrumbJsonLd, trimDescription } from "@/app/lib/seo";
import { PUBLIC_PANEL } from "@/app/lib/surfaces";
import { archiveSnapshotLabel, archiveTitle } from "@/app/briefing/archive/archive-rendering";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Briefing Archive",
  description: trimDescription("Browse previous snapshots of The Beacon's ranked briefing."),
  alternates: {
    canonical: "/briefing/archive",
  },
  openGraph: {
    type: "website",
    url: "/briefing/archive",
    title: `Briefing Archive | ${SITE_NAME}`,
    description: trimDescription("Browse previous snapshots of The Beacon's ranked briefing."),
    siteName: SITE_NAME,
    images: [
      {
        url: DEFAULT_OG_IMAGE,
        alt: "The Briefing Archive",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `Briefing Archive | ${SITE_NAME}`,
    description: trimDescription("Browse previous snapshots of The Beacon's ranked briefing."),
    images: [DEFAULT_OG_IMAGE],
  },
};

export default async function BriefingArchivePage() {
  const archives = await listBriefingArchives(60);
  const breadcrumb = breadcrumbJsonLd([
    { name: SITE_NAME, item: "/" },
    { name: "The Briefing", item: "/briefing" },
    { name: "Briefing Archive", item: "/briefing/archive" },
  ]);

  return (
    <main className="min-h-screen bg-transparent px-3 py-5 text-neutral-100 sm:px-5 sm:py-7 lg:p-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex justify-center sm:mb-8">
          <div className="flex flex-col items-center text-center">
            <Link href="/" aria-label="Go to The Beacon home page">
              <Image
                src="/psbeacon.png"
                alt="The Briefing Archive"
                width={1920}
                height={1080}
                priority
                className="h-auto w-full max-w-[300px] sm:max-w-[420px] md:max-w-[520px]"
              />
            </Link>
            <p className="mt-2 text-sm text-neutral-400 sm:mt-3 sm:text-base">One Story, Multiple Perspectives.</p>
            <div className="mt-5 h-px w-full bg-gradient-to-r from-transparent via-[#163754] to-transparent opacity-80 sm:mt-8" />
          </div>
        </div>

        <header className="mb-6 flex flex-col items-start justify-between gap-3 sm:mb-8 sm:flex-row sm:items-center">
          <BackLink href="/briefing" />
          <div className="text-left sm:text-right">
            <h1 className="text-2xl font-semibold text-neutral-100 sm:text-3xl">Briefing Archive</h1>
          </div>
        </header>

        {archives.length === 0 ? (
          <div className={`${PUBLIC_PANEL} p-5 text-center sm:p-8`}>
            <h2 className="text-2xl font-semibold text-neutral-100">No archives yet</h2>
            <p className="mt-3 text-sm leading-6 text-neutral-400">
              Once the scheduled archive job runs, previous briefings will appear here.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {archives.map((archive) => (
              <Link
                key={archive.archive_key}
                href={`/briefing/archive/${archive.archive_key}`}
                className={`${PUBLIC_PANEL} block p-5 transition hover:border-[#28445d] hover:bg-[#081724]`}
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d7c08d]">
                  {archiveSnapshotLabel(archive.archive_key, archive.slot)}
                </div>
                <h2 className="mt-3 text-xl font-semibold leading-tight text-neutral-100">{archiveTitle(archive.archive_key)}</h2>
                <p className="mt-3 text-sm text-neutral-500">{archive.story_count} stories archived</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
