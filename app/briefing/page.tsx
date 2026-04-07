import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { formatStoryDate, formatUpdatedAt } from "@/app/lib/dates";
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

type BriefingMetaRow = {
  updated_at: string | null;
};

function splitColumns(stories: StoryWithViews[]) {
  return stories.reduce<[StoryWithViews[], StoryWithViews[]]>(
    (columns, story, index) => {
      columns[index % 2].push(story);
      return columns;
    },
    [[], []]
  );
}

function BriefingList({ stories }: { stories: StoryWithViews[] }) {
  return (
    <div className="space-y-6">
      {stories.map((story) => (
        <Link
          key={story.id}
          href={`/story/${story.id}?from=briefing`}
          className="block rounded-2xl border border-[#0d2438] bg-[var(--surface)] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.35)] transition hover:border-[#163754]"
        >
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
            {formatStoryDate(story.date)}
          </div>
          <div className="text-2xl font-semibold leading-tight text-neutral-100 transition hover:text-red-400">
            {displayHeadline(story)}
          </div>
          {story.summary[0] && <p className="mt-3 text-sm leading-6 text-neutral-400">{story.summary[0]}</p>}
        </Link>
      ))}
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
        .eq("beacon_include", true)
        .order("beacon_rank", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false }),
      supabase.from("briefing_meta").select("updated_at").eq("id", 1).maybeSingle(),
    ]);

    if (error) throw error;

    const stories = ((data ?? []) as StoryDbRow[]).map(coerceStory);
    const latestUpdatedAt =
      metaError && /briefing_meta/i.test(metaError.message)
        ? null
        : ((metaData as BriefingMetaRow | null)?.updated_at ?? null);
    const [lead, ...rest] = stories;
    const [leftColumn, rightColumn] = splitColumns(rest);

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
            </div>
          </div>
          <div className="mb-8 h-px w-full bg-gradient-to-r from-transparent via-[#163754] to-transparent opacity-80" />

          <div className="mb-8">
            <div className="flex items-center justify-between gap-4">
              <Link
                href="/"
                className="rounded-full border border-[#0d2438] bg-[#020b14] px-5 py-2 text-sm text-[#d7e2ef] transition hover:border-[#163754] hover:bg-[#03101b]"
              >
                Back to Home
              </Link>
              <div className="text-sm text-neutral-400">
                Updated: {latestUpdatedAt ? formatUpdatedAt(latestUpdatedAt) : "--"}
              </div>
            </div>
          </div>

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
                className="mt-8 block rounded-2xl border border-red-500/70 bg-[var(--surface)] p-8 shadow-[0_24px_60px_rgba(0,0,0,0.35)] transition hover:border-red-400"
              >
                <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-500">
                  {formatStoryDate(lead.date)}
                </div>
                <div className="text-4xl font-semibold leading-[0.95] text-red-400 transition hover:text-red-300 md:text-6xl">
                  {displayHeadline(lead)}
                </div>

                {lead.summary.length > 0 && (
                  <div className="mt-5 max-w-4xl space-y-2 text-lg leading-8 text-neutral-300">
                    {lead.summary.slice(0, 2).map((line, index) => (
                      <p key={index}>{line}</p>
                    ))}
                  </div>
                )}
              </Link>

              {rest.length > 0 && (
                <section className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-10">
                  <BriefingList stories={leftColumn} />
                  <BriefingList stories={rightColumn} />
                </section>
              )}
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
          <Link
            href="/"
            className="mt-6 inline-block rounded-full border border-[#0d2438] bg-[#020b14] px-5 py-2 text-sm text-[#d7e2ef] transition hover:border-[#163754] hover:bg-[#03101b]"
          >
            Back to Signal
          </Link>
        </div>
      </main>
    );
  }
}
