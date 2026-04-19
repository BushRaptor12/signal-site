import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import BackLink from "@/app/back-link";
import { getAccountUserId, getSeenStoryIds } from "@/app/lib/account.server";
import { formatUpdatedAt } from "@/app/lib/dates";
import { buildBriefingLayout } from "@/app/lib/briefing-layout";
import { imageObjectPosition } from "@/app/lib/image-focus";
import { DEFAULT_OG_IMAGE, SITE_NAME, trimDescription } from "@/app/lib/seo";
import { supabaseServer } from "@/app/lib/supabase.server";
import { coerceStory, type StoryDbRow } from "@/app/lib/stories";
import type { StoryWithViews } from "@/app/lib/types";

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

function StoryUpdatedStamp({ story }: { story: StoryWithViews }) {
  const value = story.content_updated_at ?? story.updated_at ?? story.created_at ?? null;
  if (!value) return null;

  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
      {formatUpdatedAt(value)}
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
            className="relative block rounded-[26px] border border-[#0d2438] bg-[var(--surface)] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.35)] transition hover:border-[#163754]"
          >
            {shouldShowStoryImageOnBriefing(story) ? (
              story.image_display === "contain" ? (
                <div className="mb-5 overflow-hidden rounded-xl bg-transparent">
                  <div className="flex justify-center p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={story.image_url!}
                      alt={displayHeadline(story)}
                      loading="lazy"
                      className="block max-h-[22rem] max-w-full rounded-lg object-contain"
                    />
                  </div>
                </div>
              ) : (
                <div className="mb-5 overflow-hidden rounded-xl bg-transparent">
                  <div className="relative aspect-[4/3]">
                    <Image
                      src={story.image_url!}
                      alt={displayHeadline(story)}
                      fill
                      sizes="(max-width: 768px) 100vw, 560px"
                      className="object-cover"
                      style={{ objectPosition: imageObjectPosition(story) }}
                    />
                  </div>
                </div>
              )
            ) : null}
            <div className={seen ? "pb-10 opacity-90" : ""}>
              <div className="mb-3 flex justify-end">
                <StoryUpdatedStamp story={story} />
              </div>
              <div className="text-2xl font-semibold leading-tight text-neutral-100 transition hover:text-[#d7c08d]">
                {displayHeadline(story)}
              </div>
              {story.summary[0] ? <p className="mt-3 text-sm leading-6 text-neutral-400">{story.summary[0]}</p> : null}
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
              <div className="flex-1 text-center">
                <h1 className="text-3xl font-semibold tracking-tight text-neutral-100 md:text-[2.5rem]">The Briefing</h1>
                <div className="mt-2 text-sm text-neutral-500">
                  Updated: {latestUpdatedAt ? formatUpdatedAt(latestUpdatedAt) : "--"}
                </div>
              </div>
              <div className="w-[78px]" aria-hidden="true" />
            </div>
          </header>

          {!lead ? (
            <div className="mt-8 rounded-2xl border border-[#0d2438] bg-[var(--surface)] px-6 py-10 text-center shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
              <h2 className="text-3xl font-semibold text-neutral-100">Nothing queued yet</h2>
              <p className="mt-3 text-base text-neutral-400">
                Mark stories in the editor with `Show this story in The Briefing` to publish them here.
              </p>
            </div>
          ) : (
            <>
              <Link
                href={`/story/${lead.id}?from=briefing`}
                className={`relative block overflow-hidden rounded-[30px] border bg-[var(--surface)] p-8 shadow-[0_24px_60px_rgba(0,0,0,0.35)] transition ${
                  leadUsesAlertStyle
                    ? "border-red-500/55 hover:border-red-400"
                    : "border-[#17324b] hover:border-[#274765]"
                }`}
              >
                <div
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-x-0 top-0 h-20 ${
                    leadUsesAlertStyle
                      ? "bg-gradient-to-b from-red-500/10 via-red-500/[0.04] to-transparent"
                      : "bg-gradient-to-b from-[#17324b]/10 via-[#17324b]/[0.03] to-transparent"
                  }`}
                />
                {shouldShowStoryImageOnBriefing(lead) ? (
                  lead.image_display === "contain" ? (
                    <div className="relative mb-6 overflow-hidden rounded-2xl bg-transparent">
                      <div className="flex justify-center p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={lead.image_url!}
                          alt={displayHeadline(lead)}
                          className="block max-h-[36rem] max-w-full rounded-xl object-contain"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="relative mb-6 overflow-hidden rounded-2xl bg-transparent">
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
                <div className={`relative ${seenStoryIds.has(lead.id) ? "pb-10 opacity-90" : ""}`}>
                  <div className="mb-4 flex justify-end">
                    <StoryUpdatedStamp story={lead} />
                  </div>
                  <div
                    className={`font-semibold leading-[0.95] transition md:text-6xl ${
                      leadUsesAlertStyle ? "text-4xl text-red-400 hover:text-red-300" : "text-[2.9rem] text-neutral-100 hover:text-[#d7c08d]"
                    }`}
                  >
                    {displayHeadline(lead)}
                  </div>

                  {lead.summary.length > 0 ? (
                    <div className="mt-5 max-w-4xl space-y-2 text-lg leading-8 text-neutral-300">
                      {lead.summary.slice(0, 2).map((line, index) => (
                        <p key={index}>{line}</p>
                      ))}
                    </div>
                  ) : null}
                </div>
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
        <div className="mx-auto max-w-4xl rounded-2xl border border-[#0d2438] bg-[var(--surface)] p-8 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
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
