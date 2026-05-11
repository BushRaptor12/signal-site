import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import BackLink from "@/app/back-link";
import AdaptiveBriefingImage from "@/app/briefing/adaptive-briefing-image";
import ManualArchiveButton from "@/app/briefing/manual-archive-button";
import { getAccountProfileByUserId, getAccountUserId, getSeenStoryIds } from "@/app/lib/account.server";
import { listBriefingArchives } from "@/app/lib/briefing-archive";
import { formatStoryDate } from "@/app/lib/dates";
import { buildBriefingLayout } from "@/app/lib/briefing-layout";
import { DEFAULT_OG_IMAGE, SITE_NAME, breadcrumbJsonLd, trimDescription } from "@/app/lib/seo";
import { supabaseServer } from "@/app/lib/supabase.server";
import { coerceStory, type StoryDbRow } from "@/app/lib/stories";
import type { StoryWithViews } from "@/app/lib/types";
import LocalBriefingUpdated from "./local-briefing-updated";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "The Briefing",
  description: trimDescription("The Beacon's ranked briefing of the most important stories and latest updates."),
  alternates: {
    canonical: "/briefing",
  },
  openGraph: {
    type: "website",
    url: "/briefing",
    title: `The Briefing | ${SITE_NAME}`,
    description: trimDescription("The Beacon's ranked briefing of the most important stories and latest updates."),
    siteName: SITE_NAME,
    images: [
      {
        url: DEFAULT_OG_IMAGE,
        alt: "The Briefing",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `The Briefing | ${SITE_NAME}`,
    description: trimDescription("The Beacon's ranked briefing of the most important stories and latest updates."),
    images: [DEFAULT_OG_IMAGE],
  },
};

function displayHeadline(story: StoryWithViews) {
  return story.beacon_headline?.trim() || story.title;
}

function displayBriefingSummary(story: StoryWithViews) {
  return story.beacon_summary?.trim() || story.summary[0] || "";
}

function displayLeadBriefingSummaryPoints(story: StoryWithViews) {
  const override = story.beacon_summary?.trim();
  if (override) {
    const overridePoints = override
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    return overridePoints.length > 0 ? overridePoints.slice(0, 2) : [override];
  }

  return story.summary.map((line) => line.trim()).filter(Boolean).slice(0, 2);
}

function shouldShowStoryImageOnBriefing(story: StoryWithViews) {
  return Boolean(story.image_url) && (story.image_show_on_briefing ?? true);
}

type BriefingMetaRow = {
  updated_at: string | null;
};

function SeenBadge() {
  return (
    <div className="pointer-events-none absolute bottom-4 right-5 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#d7c08d]">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-[1.8]">
        <path d="M1.5 12s3.75-6 10.5-6 10.5 6 10.5 6-3.75 6-10.5 6S1.5 12 1.5 12Z" />
        <circle cx="12" cy="12" r="3.25" />
      </svg>
      <span>Seen</span>
    </div>
  );
}

function StoryMetaRow({ story }: { story: StoryWithViews }) {
  return (
    <div className="mt-3 text-[11px] uppercase tracking-[0.16em] text-neutral-500">
      {formatStoryDate(story.date)}
    </div>
  );
}

function BriefingList({ stories, seenStoryIds }: { stories: StoryWithViews[]; seenStoryIds: Set<string> }) {
  return (
    <div className="space-y-6">
      {stories.map((story) => {
        const seen = seenStoryIds.has(story.id);

        return (
          <Link
            key={story.id}
            href={`/story/${story.id}?from=briefing`}
            className="group relative flex flex-col justify-start rounded-[12px] border border-[#183149]/65 bg-[#07131e] p-4 text-left shadow-[0_12px_28px_rgba(0,0,0,0.16)] transition-colors duration-200 hover:border-[#8f7740]/45 hover:bg-[#071622] sm:p-6"
          >
            <div className={seen ? "flex flex-col justify-start opacity-90" : "flex flex-col justify-start"}>
              <div className="text-[1.35rem] font-semibold leading-tight text-neutral-100 transition-colors group-hover:text-[#d7c08d] sm:text-[1.85rem]">
                {displayHeadline(story)}
              </div>
              <StoryMetaRow story={story} />
              {displayBriefingSummary(story) ? <p className="mt-3 text-[15px] leading-7 text-neutral-300">{displayBriefingSummary(story)}</p> : null}
              {shouldShowStoryImageOnBriefing(story) ? <AdaptiveBriefingImage story={story} variant="briefing-card" /> : null}
            </div>
            {seen ? <SeenBadge /> : null}
          </Link>
        );
      })}
    </div>
  );
}

export default async function BriefingPage() {
  try {
    const supabase = supabaseServer();
    const [{ data, error }, { data: metaData, error: metaError }] = await Promise.all([
      supabase
        .from("stories")
        .select("*")
        .eq("status", "published")
        .eq("beacon_include", true)
        .order("beacon_position", { ascending: true, nullsFirst: false })
        .order("beacon_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false }),
      supabase.from("briefing_meta").select("updated_at").eq("id", 1).maybeSingle(),
    ]);

    if (error) throw error;

    const stories = ((data ?? []) as StoryDbRow[]).map(coerceStory);
    const userId = await getAccountUserId();
    let seenIds: string[] = [];
    let isAdmin = false;
    if (userId) {
      const [nextSeenIds, accountProfile] = await Promise.all([
        getSeenStoryIds(userId, stories),
        getAccountProfileByUserId(userId),
      ]);
      seenIds = nextSeenIds;
      isAdmin = Boolean(accountProfile?.isAdmin);
    }
    const seenStoryIds = new Set(seenIds);
    const latestUpdatedAt =
      metaError && /briefing_meta/i.test(metaError.message)
        ? null
        : ((metaData as BriefingMetaRow | null)?.updated_at ?? null);
    const { lead, leftColumn, rightColumn } = buildBriefingLayout(stories);
    const leadUsesAlertStyle = lead?.beacon_lead_style === "alert";
    const leadSummaryPoints = lead ? displayLeadBriefingSummaryPoints(lead) : [];
    const latestArchive = (await listBriefingArchives(1).catch(() => []))[0] ?? null;
    const breadcrumb = breadcrumbJsonLd([
      { name: SITE_NAME, item: "/" },
      { name: "The Briefing", item: "/briefing" },
    ]);

    return (
      <main className="min-h-screen bg-transparent px-3 py-5 text-neutral-100 sm:px-5 sm:py-7 lg:p-8">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
        />
        <div className="mx-auto max-w-6xl">
          <div className="mb-5 flex justify-center sm:mb-6">
            <div className="flex flex-col items-center text-center">
              <Link href="/" aria-label="Go to The Beacon home page">
                <Image
                  src="/psbeacon.png"
                  alt="The Briefing"
                  width={1920}
                  height={1080}
                  priority
                  className="h-auto w-full max-w-[300px] sm:max-w-[420px] md:max-w-[520px]"
                />
              </Link>
              <p className="mt-1.5 text-sm text-neutral-400 sm:mt-2 sm:text-base">One Story, Multiple Perspectives.</p>
              <div className="mt-4 h-px w-full bg-gradient-to-r from-transparent via-[#163754] to-transparent opacity-80 sm:mt-6" />
            </div>
          </div>

          <header className="mb-5 sm:mb-7">
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
              <BackLink href="/" />
              <div className="flex-1" />
              <div className="flex flex-col items-start gap-3 sm:items-end">
                <div className="text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500 sm:text-right">
                  <span className="text-neutral-600">Updated</span>
                  <span className="ml-1 normal-case tracking-normal text-neutral-400">
                    <LocalBriefingUpdated value={latestUpdatedAt} />
                  </span>
                </div>
                {isAdmin ? <ManualArchiveButton /> : null}
              </div>
            </div>
          </header>

          <div className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-[#d7c08d]">The Briefing</div>

          {!lead ? (
            <div className="mt-8 rounded-2xl border border-[#183149]/65 bg-[#07131e] px-5 py-8 text-center shadow-[0_16px_36px_rgba(0,0,0,0.2)] sm:px-6 sm:py-10">
              <h2 className="text-2xl font-semibold text-neutral-100 sm:text-3xl">Nothing queued yet</h2>
              <p className="mt-3 text-base text-neutral-400">
                Mark stories in the editor with `Show this story in The Briefing` to publish them here.
              </p>
            </div>
          ) : (
            <>
              <Link
                href={`/story/${lead.id}?from=briefing`}
                className={`group relative block overflow-hidden rounded-[14px] border bg-[#07131e] p-4 shadow-[0_16px_36px_rgba(0,0,0,0.18)] transition-colors duration-200 sm:p-6 lg:p-8 ${
                  leadUsesAlertStyle
                    ? "border-red-500/55 hover:border-red-400 hover:bg-[#07111c]"
                    : "border-[#183149]/70 hover:border-[#8f7740]/45 hover:bg-[#071622]"
                }`}
              >
                <div className={`relative text-center ${seenStoryIds.has(lead.id) ? "opacity-90" : ""}`}>
                  <div
                    className={`font-semibold leading-tight transition-colors md:text-6xl lg:leading-[0.95] ${
                      leadUsesAlertStyle ? "text-3xl text-red-500 group-hover:text-red-400 sm:text-4xl" : "text-[2rem] text-neutral-100 group-hover:text-[#d7c08d] sm:text-[2.9rem]"
                    }`}
                  >
                    {displayHeadline(lead)}
                  </div>
                  <StoryMetaRow story={lead} />

                  {leadSummaryPoints.length > 0 ? (
                    <div className="mx-auto mt-4 max-w-4xl space-y-3 text-base leading-7 text-neutral-300 sm:mt-5 sm:text-lg sm:leading-8">
                      {leadSummaryPoints.map((point, index) => (
                        <p key={`${lead.id}-summary-${index}`}>{point}</p>
                      ))}
                    </div>
                  ) : null}
                </div>
                {shouldShowStoryImageOnBriefing(lead) ? <AdaptiveBriefingImage priority story={lead} variant="briefing-lead" /> : null}
                {seenStoryIds.has(lead.id) ? <SeenBadge /> : null}
              </Link>

              {(leftColumn.length > 0 || rightColumn.length > 0) ? (
                <section className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-10">
                  <BriefingList stories={leftColumn} seenStoryIds={seenStoryIds} />
                  <BriefingList stories={rightColumn} seenStoryIds={seenStoryIds} />
                </section>
              ) : null}
            </>
          )}

          {latestArchive ? (
            <div className="mt-10 flex justify-center border-t border-[#163754]/50 pt-6">
              <Link
                href="/briefing/archive"
                className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-600 underline decoration-[#35556f]/45 underline-offset-4 transition hover:text-neutral-300 hover:decoration-[#8f7740]/65"
              >
                View briefing archive
              </Link>
            </div>
          ) : null}
        </div>
      </main>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return (
      <main className="min-h-screen bg-transparent px-3 py-5 text-neutral-100 sm:px-5 sm:py-7 lg:p-8">
        <div className="mx-auto max-w-4xl rounded-2xl border border-[#183149]/65 bg-[#07131e] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.3)] sm:p-8">
          <div className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">The Briefing</div>
          <h1 className="mt-3 text-3xl font-semibold text-neutral-100">Could not load stories</h1>
          <p className="mt-3 text-neutral-400">{message}</p>
          <div className="mt-6">
            <BackLink href="/" />
          </div>
        </div>
      </main>
    );
  }
}
