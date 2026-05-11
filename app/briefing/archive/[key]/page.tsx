import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import BackLink from "@/app/back-link";
import { ArchiveCapturedTitle } from "@/app/briefing/archive/archive-time";
import { ArchiveBriefingView, ArchiveTimestamp, archiveTitle, displayArchiveHeadline } from "@/app/briefing/archive/archive-rendering";
import { getBriefingArchive } from "@/app/lib/briefing-archive";
import { DEFAULT_OG_IMAGE, SITE_NAME, breadcrumbJsonLd, trimDescription } from "@/app/lib/seo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ key: string }>;
}): Promise<Metadata> {
  const { key } = await params;
  const archive = await getBriefingArchive(key);

  if (!archive) {
    return {
      title: "Briefing Archive",
      robots: {
        index: false,
        follow: true,
      },
    };
  }

  const title = archiveTitle(archive.captured_at);
  const leadHeadline = archive.snapshot.lead ? displayArchiveHeadline(archive.snapshot.lead) : "Archived briefing";
  const description = trimDescription(`${title}: ${leadHeadline}`);

  return {
    title,
    description,
    alternates: {
      canonical: `/briefing/archive/${archive.archive_key}`,
    },
    openGraph: {
      type: "article",
      url: `/briefing/archive/${archive.archive_key}`,
      title: `${title} | ${SITE_NAME}`,
      description,
      siteName: SITE_NAME,
      publishedTime: archive.captured_at,
      modifiedTime: archive.captured_at,
      images: [
        {
          url: archive.snapshot.lead?.image_url || DEFAULT_OG_IMAGE,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${SITE_NAME}`,
      description,
      images: [archive.snapshot.lead?.image_url || DEFAULT_OG_IMAGE],
    },
  };
}

export default async function BriefingArchiveDetailPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const archive = await getBriefingArchive(key);

  if (!archive) {
    notFound();
  }
  const title = archiveTitle(archive.captured_at);
  const breadcrumb = breadcrumbJsonLd([
    { name: SITE_NAME, item: "/" },
    { name: "The Briefing", item: "/briefing" },
    { name: "Briefing Archive", item: "/briefing/archive" },
    { name: title, item: `/briefing/archive/${archive.archive_key}` },
  ]);

  return (
    <main className="min-h-screen bg-transparent px-3 py-5 text-neutral-100 sm:px-5 sm:py-7 lg:p-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex justify-center sm:mb-8">
          <div className="flex flex-col items-center text-center">
            <Link href="/" aria-label="Go to The Beacon home page">
              <Image
                src="/psbeacon.png"
                alt={title}
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

        <header className="mb-6 flex flex-col items-start justify-between gap-3 sm:mb-8 sm:flex-row sm:items-end">
          <BackLink href="/briefing/archive" />
          <div className="text-left sm:text-right">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d7c08d]">Archived</div>
            <h1 className="mt-3 text-2xl font-semibold leading-tight text-neutral-100 sm:text-3xl">
              <ArchiveCapturedTitle value={archive.captured_at} />
            </h1>
            <div className="mt-2">
              <ArchiveTimestamp archive={archive} />
            </div>
          </div>
        </header>

        <ArchiveBriefingView archive={archive} />
      </div>
    </main>
  );
}
