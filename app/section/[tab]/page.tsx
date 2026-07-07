import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE, SITE_NAME, trimDescription } from "@/app/lib/seo";
import { NEWS_SECTION_TABS, newsSectionLabel } from "@/app/lib/news-sections";
import { supabaseServer } from "@/app/lib/supabase.server";
import { coerceStory, STORY_CARD_SELECT, type StoryDbRow } from "@/app/lib/stories";
import type { StoryWithViews } from "@/app/lib/types";
import { normalize } from "@/app/lib/vocab";
import NewsSectionNav from "@/app/news-section-nav";
import SectionStories from "./section-stories";

type SectionPageProps = {
  params: Promise<{ tab: string }>;
};

const SECTION_STORY_LIMIT = 80;

function publishedAtMs(story: StoryWithViews): number {
  const created = new Date(story.created_at ?? "").getTime();
  if (Number.isFinite(created) && created > 0) return created;

  const dateOnly = new Date(story.date ?? "").getTime();
  return Number.isFinite(dateOnly) ? dateOnly : 0;
}

function updatedAtMs(story: StoryWithViews): number {
  const contentUpdated = new Date(story.content_updated_at ?? "").getTime();
  if (Number.isFinite(contentUpdated) && contentUpdated > 0) return contentUpdated;

  const updated = new Date(story.updated_at ?? "").getTime();
  if (Number.isFinite(updated) && updated > 0) return updated;

  return publishedAtMs(story);
}

function popularScore(story: StoryWithViews, nowMs: number): number {
  const hoursSincePublish = Math.max(0, (nowMs - publishedAtMs(story)) / 3_600_000);
  return Number(story.views ?? 0) / (hoursSincePublish + 2);
}

function sortPopular(stories: StoryWithViews[], nowMs: number) {
  return [...stories].sort((left, right) => {
    const score = popularScore(right, nowMs) - popularScore(left, nowMs);
    if (score !== 0) return score;

    const views = Number(right.views ?? 0) - Number(left.views ?? 0);
    if (views !== 0) return views;

    return updatedAtMs(right) - updatedAtMs(left);
  });
}

function sortStories(stories: StoryWithViews[], tab: string) {
  if (tab === "popular") return sortPopular(stories, Date.now());
  return [...stories].sort((left, right) => publishedAtMs(right) - publishedAtMs(left));
}

function filterStoriesForTab(stories: StoryWithViews[], tab: string) {
  if (tab === "popular" || tab === "latest") return sortStories(stories, tab);

  return sortStories(
    stories.filter((story) => story.topics.map(normalize).includes(tab)),
    tab
  );
}

async function loadSectionStories(tab: string) {
  const supabase = supabaseServer();
  let query = supabase
    .from("stories")
    .select(STORY_CARD_SELECT)
    .eq("status", "published")
    .eq("pinned", false);

  if (tab !== "popular" && tab !== "latest") {
    query = query.contains("topics", [tab]);
  }

  const { data, error } = await query
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(SECTION_STORY_LIMIT);

  if (error) {
    throw error;
  }

  return filterStoriesForTab(((data ?? []) as unknown as StoryDbRow[]).map(coerceStory), tab);
}

export async function generateMetadata({ params }: SectionPageProps): Promise<Metadata> {
  const { tab } = await params;
  const normalizedTab = normalize(decodeURIComponent(tab));
  if (!NEWS_SECTION_TABS.includes(normalizedTab)) return {};

  const label = newsSectionLabel(normalizedTab);
  const description = trimDescription(`${label} stories from ${SITE_NAME}.`);

  return {
    title: label,
    description,
    alternates: {
      canonical: `/section/${normalizedTab}`,
    },
    openGraph: {
      type: "website",
      url: `/section/${normalizedTab}`,
      title: `${label} | ${SITE_NAME}`,
      description,
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
      title: `${label} | ${SITE_NAME}`,
      description,
      images: [DEFAULT_OG_IMAGE],
    },
  };
}

export default async function SectionPage({ params }: SectionPageProps) {
  const { tab } = await params;
  const normalizedTab = normalize(decodeURIComponent(tab));
  if (!NEWS_SECTION_TABS.includes(normalizedTab)) notFound();

  const stories = await loadSectionStories(normalizedTab);
  const label = newsSectionLabel(normalizedTab);

  return (
    <>
      <NewsSectionNav activeTab={normalizedTab} />
      <main className="min-h-screen bg-transparent px-3 pb-3 pt-1 text-neutral-100 sm:px-5 sm:pb-7 sm:pt-3 lg:px-8 lg:pb-8 lg:pt-4">
        <div className="mx-auto max-w-6xl">
          <div className="mb-4 flex justify-center sm:mb-7">
            <div className="flex flex-col items-center text-center">
              <Link href="/" aria-label="Go to The Beacon home page">
                <Image
                  src="/psbeacon.png?v=20260707"
                  alt={SITE_NAME}
                  width={1920}
                  height={1080}
                  priority
                  className="h-auto w-full max-w-[188px] sm:max-w-[420px] md:max-w-[520px]"
                />
              </Link>
              <p className="mt-0.5 text-xs text-neutral-500 sm:mt-2 sm:text-base sm:text-neutral-400">One Story, Multiple Perspectives.</p>
              <div className="mt-2 h-px w-full bg-gradient-to-r from-transparent via-[#163754] to-transparent opacity-80 sm:mt-6" />
            </div>
          </div>

          <header className="mb-4 sm:mb-6">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d7c08d] sm:text-sm sm:tracking-[0.2em]">{label}</div>
          </header>

          {stories.length === 0 ? (
            <section className="rounded-[14px] border border-[#183149]/65 bg-[#07131e] px-5 py-8 text-center shadow-[0_16px_36px_rgba(0,0,0,0.2)] sm:px-6 sm:py-10">
              <h1 className="text-2xl font-semibold text-neutral-100 sm:text-3xl">No stories in this section yet</h1>
              <p className="mx-auto mt-3 max-w-xl text-base text-neutral-400">Try another section or return to the briefing.</p>
            </section>
          ) : (
            <SectionStories stories={stories} />
          )}
        </div>
      </main>
    </>
  );
}
