import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import BackLink from "@/app/back-link";
import { getAccountUserId, getSeenStoryIds } from "@/app/lib/account.server";
import { formatStoryDate } from "@/app/lib/dates";
import { buildBriefingLayout } from "@/app/lib/briefing-layout";
import { imageObjectPosition } from "@/app/lib/image-focus";
import { DEFAULT_OG_IMAGE, SITE_NAME, trimDescription } from "@/app/lib/seo";
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
            className="relative flex flex-col justify-start rounded-[12px] border border-[#183149]/65 bg-[#07131e] p-6 text-left shadow-[0_16px_34px_rgba(0,0,0,0.2)] transition hover:border-[#28445d]"
          >
            <div className={seen ? "flex flex-col justify-start opacity-90" : "flex flex-col justify-start"}>
              <div className="text-[1.85rem] font-semibold leading-tight text-neutral-100 transition hover:text-[#d7c08d]">
                {displayHeadline(story)}
              </div>
              <StoryMetaRow story={story} />
              {story.summary[0] ? <p className="mt-3 text-[15px] leading-7 text-neutral-300">{story.summary[0]}</p> : null}
              {shouldShowStoryImageOnBriefing(story) ? (
                story.image_display === "contain" ? (
                  <div className="mt-5 flex justify-center">
                    <div className="w-full max-w-[18rem]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={story.image_url!}
                        alt={displayHeadline(story)}
                        loading="lazy"
                        className="block max-h-[22rem] max-w-full object-contain"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 overflow-hidden">
                    <div className="relative mx-auto aspect-[5/4] max-w-[19rem]">
                      <Image
                        src={story.image_url!}
                        alt={displayHeadline(story)}
                        fill
                        sizes="(max-width: 768px) 100vw, 304px"
                        className="object-cover"
                        style={{ objectPosition: imageObjectPosition(story) }}
                      />
                    </div>
                  </div>
                )
              ) : null}
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
    const seenStoryIds = new Set(userId ? await getSeenStoryIds(userId, stories.map((story) => story.id)) : []);
    const latestUpdatedAt =
      metaError && /briefing_meta/i.test(metaError.message)
        ? null
        : ((metaData as BriefingMetaRow | null)?.updated_at ?? null);
    const { lead, leftColumn, rightColumn } = buildBriefingLayout(stories);
    const leadUsesAlertStyle = lead?.beacon_lead_style === "alert";

    return (
      <main className="min-h-screen bg-transparent p-8 text-neutral-100">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 flex justify-center">
            <div className="flex flex-col items-center text-center">
              <Link href="/" aria-label="Go to The Beacon home page">
                <Image
                  src="/psbeacon.png"
                  alt="The Briefing"
                  width={1920}
                  height={1080}
                  priority
                  className="h-auto w-full max-w-[420px] md:max-w-[520px]"
                />
              </Link>
              <p className="mt-3 text-neutral-400">Multi-source news. Clear perspective.</p>
              <div className="mt-8 h-px w-full bg-gradient-to-r from-transparent via-[#163754] to-transparent opacity-80" />
            </div>
          </div>

          <header className="mb-8">
            <div className="flex items-center justify-between gap-4">
              <BackLink href="/" />
              <div className="flex-1" />
              <div className="text-right text-sm text-neutral-500">
                Updated: <LocalBriefingUpdated value={latestUpdatedAt} />
              </div>
            </div>
          </header>

          {!lead ? (
            <div className="mt-8 rounded-2xl border border-[#183149]/65 bg-[#07131e] px-6 py-10 text-center shadow-[0_24px_60px_rgba(0,0,0,0.3)]">
              <h2 className="text-3xl font-semibold text-neutral-100">Nothing queued yet</h2>
              <p className="mt-3 text-base text-neutral-400">
                Mark stories in the editor with `Show this story in The Briefing` to publish them here.
              </p>
            </div>
          ) : (
            <>
              <Link
                href={`/story/${lead.id}?from=briefing`}
                className={`relative block overflow-hidden rounded-[14px] border bg-[#07131e] p-8 shadow-[0_20px_46px_rgba(0,0,0,0.22)] transition ${
                  leadUsesAlertStyle
                    ? "border-red-500/55 hover:border-red-400"
                    : "border-[#183149]/70 hover:border-[#28445d]"
                }`}
              >
                <div className={`relative ${seenStoryIds.has(lead.id) ? "opacity-90" : ""}`}>
                  <div
                    className={`font-semibold leading-[0.95] transition md:text-6xl ${
                      leadUsesAlertStyle ? "text-4xl text-red-400 hover:text-red-300" : "text-[2.9rem] text-neutral-100 hover:text-[#d7c08d]"
                    }`}
                  >
                    {displayHeadline(lead)}
                  </div>
                  <StoryMetaRow story={lead} />

                  {lead.summary.length > 0 ? (
                    <div className="mt-5 max-w-4xl space-y-2 text-lg leading-8 text-neutral-300">
                      {lead.summary.slice(0, 2).map((line, index) => (
                        <p key={index}>{line}</p>
                      ))}
                    </div>
                  ) : null}
                </div>
                {shouldShowStoryImageOnBriefing(lead) ? (
                  lead.image_display === "contain" ? (
                    <div className="relative mt-6 flex justify-center">
                      <div className="w-full">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={lead.image_url!}
                          alt={displayHeadline(lead)}
                          className="block max-h-[36rem] max-w-full object-contain"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="relative mt-6 overflow-hidden">
                      <div className="relative aspect-[4/3] md:aspect-[16/10]">
                        <Image
                          src={lead.image_url!}
                          alt={displayHeadline(lead)}
                          fill
                          priority
                          sizes="(max-width: 768px) 100vw, 1152px"
                          className="object-cover"
                          style={{ objectPosition: imageObjectPosition(lead) }}
                        />
                      </div>
                    </div>
                  )
                ) : null}
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
        </div>
      </main>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return (
      <main className="min-h-screen bg-transparent p-8 text-neutral-100">
        <div className="mx-auto max-w-4xl rounded-2xl border border-[#183149]/65 bg-[#07131e] p-8 shadow-[0_24px_60px_rgba(0,0,0,0.3)]">
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
