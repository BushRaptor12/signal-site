import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import BackLink from "@/app/back-link";
import AdaptiveBriefingImage from "@/app/briefing/adaptive-briefing-image";
import {
  buildCoverageHubData,
  listCoverageHubSlugs,
  type CoverageHubData,
} from "@/app/lib/coverage-hubs";
import { getCoverageHub as getStoredCoverageHub } from "@/app/lib/coverage-hubs.server";
import { formatStoryDate } from "@/app/lib/dates";
import { DEFAULT_OG_IMAGE, SITE_NAME, absoluteUrl, breadcrumbJsonLd, trimDescription } from "@/app/lib/seo";
import {
  PUBLIC_INSET_ELEVATED,
  PUBLIC_INSET_ELEVATED_INTERACTIVE,
  PUBLIC_PAGE,
  PUBLIC_PANEL,
  PUBLIC_PANEL_PADDING,
} from "@/app/lib/surfaces";
import { supabaseServer } from "@/app/lib/supabase.server";
import { coerceStory, type StoryDbRow } from "@/app/lib/stories";
import type { StoryWithViews } from "@/app/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function loadCoverageHub(slug: string): Promise<CoverageHubData | null> {
  const hub = await getStoredCoverageHub(slug);
  if (!hub) return null;
  const storyIds = Array.from(
    new Set(
      [hub.heroStoryId, ...hub.latestStoryIds, ...hub.sections.flatMap((section) => section.storyIds)].filter(
        (value): value is string => Boolean(value && value.trim())
      )
    )
  );
  if (storyIds.length === 0) {
    return buildCoverageHubData(hub, []);
  }

  const supabase = supabaseServer();
  const { data, error } = await supabase.from("stories").select("*").eq("status", "published").in("id", storyIds);
  if (error) throw error;

  const stories = ((data ?? []) as StoryDbRow[]).map(coerceStory);
  return buildCoverageHubData(hub, stories);
}

function storyCardSummary(story: StoryWithViews) {
  return story.summary[0] || "";
}

function StoryChip({ story }: { story: StoryWithViews }) {
  return (
    <Link
      href={`/story/${story.id}`}
      className={`${PUBLIC_INSET_ELEVATED_INTERACTIVE} flex flex-col gap-3 p-5`}
    >
      <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">{formatStoryDate(story.date)}</div>
      <div className="text-xl font-semibold leading-tight text-neutral-100">{story.title}</div>
      {storyCardSummary(story) ? <p className="text-sm leading-6 text-neutral-400">{storyCardSummary(story)}</p> : null}
      {story.image_url && (story.image_show_on_briefing ?? true) ? <AdaptiveBriefingImage story={story} variant="briefing-card" /> : null}
    </Link>
  );
}

export async function generateStaticParams() {
  return listCoverageHubSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const hub = await getStoredCoverageHub(slug);
  if (!hub) {
    return {
      title: "Coverage",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const title = `${hub.title} Coverage | ${SITE_NAME}`;
  const description = trimDescription(hub.description);
  const canonical = `/coverage/${hub.slug}`;

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      type: "website",
      url: canonical,
      title,
      description,
      siteName: SITE_NAME,
      images: [
        {
          url: absoluteUrl(DEFAULT_OG_IMAGE),
          alt: hub.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [absoluteUrl(DEFAULT_OG_IMAGE)],
    },
  };
}

export default async function CoverageHubPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const hub = await loadCoverageHub(slug);

  if (!hub) {
    notFound();
  }
  const breadcrumb = breadcrumbJsonLd([
    { name: SITE_NAME, item: "/" },
    { name: hub.title, item: `/coverage/${hub.slug}` },
  ]);

  return (
    <main className={PUBLIC_PAGE}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-4">
          <BackLink href="/" />
          <Link
            href="/briefing"
            className="rounded-full border border-[#1c3953]/70 bg-[#081724] px-4 py-2 text-xs font-semibold text-neutral-200 transition hover:border-[#28445d] hover:bg-[#0a1926]"
          >
            View briefing
          </Link>
        </div>

        <section className={`${PUBLIC_PANEL} ${PUBLIC_PANEL_PADDING} mt-8 overflow-hidden`}>
          <div className="max-w-4xl">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#d7c08d]">{hub.eyebrow}</div>
            <div className="mt-3 text-sm uppercase tracking-[0.18em] text-neutral-500">{hub.dateLabel}</div>
            <h1 className="mt-4 text-[2rem] font-semibold leading-tight text-neutral-100 sm:text-4xl md:text-6xl">{hub.title}</h1>
            <p className="mt-4 max-w-3xl text-lg leading-8 text-neutral-300">{hub.dek}</p>
          </div>

        </section>

        <section className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.9fr)]">
          <div className="space-y-8">
            {hub.heroStory ? (
              <article className={`${PUBLIC_PANEL} ${PUBLIC_PANEL_PADDING}`}>
                <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Featured Story</div>
                <Link href={`/story/${hub.heroStory.id}`} className="mt-4 block">
                  <h2 className="text-[1.8rem] font-semibold leading-tight text-neutral-100 transition hover:text-[#d7c08d] sm:text-3xl md:text-5xl">
                    {hub.heroStory.title}
                  </h2>
                </Link>
                <div className="mt-3 text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                  {formatStoryDate(hub.heroStory.date)}
                </div>
                {storyCardSummary(hub.heroStory) ? <p className="mt-4 max-w-3xl text-lg leading-8 text-neutral-300">{storyCardSummary(hub.heroStory)}</p> : null}
                {hub.heroStory.image_url && (hub.heroStory.image_show_on_briefing ?? true) ? (
                  <div className="mt-6">
                    <AdaptiveBriefingImage priority story={hub.heroStory} variant="briefing-lead" />
                  </div>
                ) : null}
              </article>
            ) : (
              <div className={`${PUBLIC_PANEL} ${PUBLIC_PANEL_PADDING}`}>
                <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Featured Story</div>
                <p className="mt-4 text-sm leading-6 text-neutral-400">
                  A featured story will appear here as this coverage develops.
                </p>
              </div>
            )}

            {hub.latestStories.length > 0 ? (
              <section>
                <div className="mb-4">
                  <h2 className="text-2xl font-semibold text-neutral-100">Latest Updates</h2>
                  <p className="mt-1 text-sm text-neutral-500">The newest reporting, reactions, and follow-up stories from across the coverage.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {hub.latestStories.map((story) => (
                    <StoryChip key={story.id} story={story} />
                  ))}
                </div>
              </section>
            ) : null}

            {hub.sections.map((section) =>
              section.stories.length > 0 ? (
                <section key={section.id}>
                  <div className="mb-4">
                    <h2 className="text-2xl font-semibold text-neutral-100">{section.title}</h2>
                    {section.description ? <p className="mt-1 text-sm text-neutral-500">{section.description}</p> : null}
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {section.stories.map((story) => (
                      <StoryChip key={story.id} story={story} />
                    ))}
                  </div>
                </section>
              ) : null
            )}
          </div>

          <aside className="space-y-6">
            <section className={`${PUBLIC_PANEL} p-6`}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#d7c08d]">
                {hub.picksTitle ?? "Pick Tracker"}
              </div>
              {hub.picks.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {hub.picks.map((pick) => (
                    <div key={`${pick.pick}-${pick.team}-${pick.player}`} className={`${PUBLIC_INSET_ELEVATED} px-4 py-4`}>
                      <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">{pick.pick} • {pick.team}</div>
                      <div className="mt-2 text-base font-semibold text-neutral-100">{pick.player}</div>
                      {pick.school ? <div className="mt-1 text-sm text-neutral-400">{pick.school}</div> : null}
                      {pick.note ? <div className="mt-2 text-sm leading-6 text-neutral-300">{pick.note}</div> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className={`${PUBLIC_INSET_ELEVATED} mt-4 px-4 py-4 text-sm leading-6 text-neutral-400`}>
                  Pick-by-pick updates will appear here as the board takes shape.
                </div>
              )}
            </section>

            <section className={`${PUBLIC_PANEL} p-6`}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#d7c08d]">What To Watch</div>
              <div className="mt-4 space-y-3 text-sm leading-6 text-neutral-300">
                <p>Track the biggest selections, the fastest risers, and the teams reshaping their plans in real time.</p>
                <p>Follow the latest reporting as the board changes and the ripple effects reach schools, front offices, and fan bases across the league.</p>
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}
