import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getAccountUserId, getFollowedInterestsWithMatches, getFollowedStoryIds } from "@/app/lib/account.server";
import { DEFAULT_OG_IMAGE, SITE_NAME, trimDescription } from "@/app/lib/seo";
import { supabaseServer } from "@/app/lib/supabase.server";
import { coerceStory, STORY_CARD_SELECT, type StoryDbRow } from "@/app/lib/stories";
import type { StoryWithViews } from "@/app/lib/types";
import NewsSectionNav from "@/app/news-section-nav";
import HomePageClient from "../home-page-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Your Feed",
  description: trimDescription("Browse The Beacon's personalized and latest story feed."),
  alternates: {
    canonical: "/feed",
  },
  openGraph: {
    type: "website",
    url: "/feed",
    title: `Your Feed | ${SITE_NAME}`,
    description: trimDescription("Browse The Beacon's personalized and latest story feed."),
    siteName: SITE_NAME,
    images: [
      {
        url: DEFAULT_OG_IMAGE,
        alt: "Your Feed",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `Your Feed | ${SITE_NAME}`,
    description: trimDescription("Browse The Beacon's personalized and latest story feed."),
    images: [DEFAULT_OG_IMAGE],
  },
};

async function loadInitialStories(): Promise<StoryWithViews[]> {
  try {
    const supabase = supabaseServer();
    const [trackingResult, feedResult] = await Promise.all([
      supabase
        .from("stories")
        .select(STORY_CARD_SELECT)
        .eq("status", "published")
        .eq("pinned", true)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false }),
      supabase
        .from("stories")
        .select(STORY_CARD_SELECT)
        .eq("status", "published")
        .eq("pinned", false)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(30),
    ]);

    if (trackingResult.error) {
      throw trackingResult.error;
    }
    if (feedResult.error) {
      throw feedResult.error;
    }

    return ([...(trackingResult.data ?? []), ...(feedResult.data ?? [])] as unknown as StoryDbRow[]).map(coerceStory);
  } catch {
    return [];
  }
}

function serverRenderNowMs() {
  return Date.now();
}

export default async function FeedPage() {
  const userId = await getAccountUserId();
  if (!userId) {
    return (
      <>
        <NewsSectionNav activeTab="feed" />
        <main className="min-h-screen bg-transparent px-4 pb-6 pt-2 text-neutral-100 sm:px-6 sm:pb-10 sm:pt-4">
          <div className="mx-auto max-w-2xl">
            <div className="flex justify-center">
              <Link href="/" aria-label="Go to The Beacon home page">
                <Image
                  src="/psbeacon.png?v=20260707"
                  alt={SITE_NAME}
                  width={1920}
                  height={1080}
                  priority
                  className="h-auto w-[138px] sm:w-[176px]"
                />
              </Link>
            </div>
            <section className="mt-8 rounded-[18px] border border-[#183149]/65 bg-[#07131e] p-5 text-center shadow-[0_24px_60px_rgba(0,0,0,0.3)] sm:p-8">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d7c08d]">Your Feed</div>
              <h1 className="mt-3 text-3xl font-semibold leading-tight text-neutral-100">Log in to view your feed</h1>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-neutral-400 sm:text-base">
                Your feed combines followed topics, tracked stories, and the latest coverage into a personal view.
              </p>
              <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                <Link
                  href="/account/login"
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#8f7740]/70 bg-[#07101a] px-5 py-2.5 text-sm font-semibold text-neutral-100 transition hover:border-[#b89a55] hover:bg-[#0a1724]"
                >
                  Log in or create account
                </Link>
                <Link
                  href="/"
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#163754] bg-[#020b14] px-5 py-2.5 text-sm font-semibold text-neutral-300 transition hover:border-[#30516d] hover:text-white"
                >
                  Back to home
                </Link>
              </div>
            </section>
          </div>
        </main>
      </>
    );
  }

  const [initialStories, initialFollowedStoryIds, initialFollowedInterests] = await Promise.all([
    loadInitialStories(),
    getFollowedStoryIds(userId).catch(() => []),
    getFollowedInterestsWithMatches(userId).catch(() => []),
  ]);
  const initialNowMs = serverRenderNowMs();

  return (
    <>
      <NewsSectionNav activeTab="feed" />
      <HomePageClient
        initialStories={initialStories}
        initialAccountAuthenticated={Boolean(userId)}
        initialFollowedInterests={initialFollowedInterests}
        initialFollowedStoryIds={initialFollowedStoryIds}
        initialNowMs={initialNowMs}
      />
    </>
  );
}
