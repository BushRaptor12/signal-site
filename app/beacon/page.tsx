import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import InstallAppPrompt from "@/app/install-app-prompt";
import { getAccountUserId } from "@/app/lib/account.server";
import { formatStoryDate, formatUpdatedAgo } from "@/app/lib/dates";
import { imageObjectPosition } from "@/app/lib/image-focus";
import { DEFAULT_OG_IMAGE, SITE_NAME, trimDescription } from "@/app/lib/seo";
import { supabaseServer } from "@/app/lib/supabase.server";
import { coerceStory, STORY_CARD_SELECT, type StoryDbRow } from "@/app/lib/stories";
import type { StoryWithViews } from "@/app/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Beacon App",
  description: trimDescription("A mobile-first entry point for The Beacon briefing, latest stories, follows, and alerts."),
  alternates: {
    canonical: "/beacon",
  },
  openGraph: {
    type: "website",
    url: "/beacon",
    title: `Beacon App | ${SITE_NAME}`,
    description: trimDescription("A mobile-first entry point for The Beacon briefing, latest stories, follows, and alerts."),
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
    title: `Beacon App | ${SITE_NAME}`,
    description: trimDescription("A mobile-first entry point for The Beacon briefing, latest stories, follows, and alerts."),
    images: [DEFAULT_OG_IMAGE],
  },
};

type BeaconHomeData = {
  authenticated: boolean;
  briefingStories: StoryWithViews[];
  latestStories: StoryWithViews[];
};

function displayHeadline(story: StoryWithViews) {
  return story.beacon_headline?.trim() || story.title;
}

function displaySummary(story: StoryWithViews) {
  const override = story.beacon_summary?.trim();
  if (override) return override.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0] ?? override;
  return story.summary[0] ?? "";
}

function updatedLabel(story: StoryWithViews) {
  const value = story.content_updated_at ?? story.updated_at ?? story.created_at;
  return value ? formatUpdatedAgo(value) : formatStoryDate(story.date);
}

async function loadBeaconHome(): Promise<BeaconHomeData> {
  try {
    const supabase = supabaseServer();
    const [userId, briefingResult, latestResult] = await Promise.all([
      getAccountUserId().catch(() => null),
      supabase
        .from("stories")
        .select("*")
        .eq("status", "published")
        .eq("beacon_include", true)
        .order("beacon_position", { ascending: true, nullsFirst: false })
        .order("beacon_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("stories")
        .select(STORY_CARD_SELECT)
        .eq("status", "published")
        .eq("pinned", false)
        .order("content_updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(6),
    ]);

    if (briefingResult.error) throw briefingResult.error;
    if (latestResult.error) throw latestResult.error;

    return {
      authenticated: Boolean(userId),
      briefingStories: ((briefingResult.data ?? []) as unknown as StoryDbRow[]).map(coerceStory),
      latestStories: ((latestResult.data ?? []) as unknown as StoryDbRow[]).map(coerceStory),
    };
  } catch {
    return {
      authenticated: false,
      briefingStories: [],
      latestStories: [],
    };
  }
}

function StoryImage({ priority = false, story }: { priority?: boolean; story: StoryWithViews }) {
  if (!story.image_url || story.image_show_on_homepage === false) return null;

  return (
    <div className="relative mt-4 aspect-[16/10] overflow-hidden rounded-[10px] border border-[#183149]/70 bg-[#020b14]">
      <Image
        src={story.image_url}
        alt=""
        fill
        priority={priority}
        sizes="(max-width: 768px) 92vw, 384px"
        className="object-cover"
        style={{ objectPosition: imageObjectPosition(story) }}
      />
    </div>
  );
}

function LeadStoryCard({ story }: { story: StoryWithViews }) {
  return (
    <Link
      href={`/story/${story.id}?from=beacon`}
      className="block rounded-[14px] border border-[#28445d]/80 bg-[#07131e] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.24)] transition hover:border-[#8f7740]/65 hover:bg-[#071622] sm:p-6"
    >
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d7c08d]">
        <span>Start Here</span>
        {story.urgent ? <span className="rounded-full border border-red-500/45 px-2 py-0.5 text-red-300">Urgent</span> : null}
      </div>
      <h1 className="mt-3 text-[2rem] font-semibold leading-tight text-neutral-50 sm:text-4xl">{displayHeadline(story)}</h1>
      {displaySummary(story) ? <p className="mt-4 text-base leading-7 text-neutral-300">{displaySummary(story)}</p> : null}
      <StoryImage priority story={story} />
      <div className="mt-4 flex items-center justify-between gap-4 text-xs uppercase tracking-[0.14em] text-neutral-500">
        <span>{formatStoryDate(story.date)}</span>
        <span>{updatedLabel(story)}</span>
      </div>
    </Link>
  );
}

function CompactStoryLink({ story }: { story: StoryWithViews }) {
  return (
    <Link
      href={`/story/${story.id}?from=beacon`}
      className="block rounded-[12px] border border-[#183149]/70 bg-[#07131e] p-4 transition hover:border-[#8f7740]/55 hover:bg-[#071622]"
    >
      <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.16em] text-neutral-500">
        <span>{formatStoryDate(story.date)}</span>
        <span>{updatedLabel(story)}</span>
      </div>
      <h2 className="mt-2 text-lg font-semibold leading-snug text-neutral-100">{displayHeadline(story)}</h2>
      {displaySummary(story) ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-neutral-400">{displaySummary(story)}</p> : null}
    </Link>
  );
}

export default async function BeaconAppPage() {
  const { authenticated, briefingStories, latestStories } = await loadBeaconHome();
  const lead = briefingStories[0] ?? latestStories[0] ?? null;
  const secondaryBriefing = briefingStories.filter((story) => story.id !== lead?.id).slice(0, 3);
  const latest = latestStories.filter((story) => story.id !== lead?.id).slice(0, 4);

  return (
    <main className="min-h-screen bg-transparent px-4 py-5 text-neutral-100 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <div className="flex justify-center pt-2 md:pt-4">
          <Link href="/" aria-label="Go to The Beacon home page" className="inline-flex justify-center">
            <Image
              src="/psbeacon.png"
              alt="The Beacon"
              width={1920}
              height={807}
              priority
              className="h-auto w-full max-w-[16rem] sm:max-w-[24rem]"
            />
          </Link>
        </div>

        <div className="mt-5 grid gap-4 md:mt-8 md:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.8fr)] md:items-start">
          <div className="space-y-4">
            <InstallAppPrompt />

            {lead ? (
              <LeadStoryCard story={lead} />
            ) : (
              <section className="rounded-[14px] border border-[#28445d]/80 bg-[#07131e] p-6 text-center shadow-[0_18px_42px_rgba(0,0,0,0.24)]">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#d7c08d]">Beacon App</div>
                <h1 className="mt-3 text-3xl font-semibold leading-tight text-neutral-50">One Story, Multiple Perspectives.</h1>
                <p className="mt-4 text-base leading-7 text-neutral-300">
                  The app home is ready. Publish stories into The Briefing to fill this screen.
                </p>
              </section>
            )}

            {secondaryBriefing.length > 0 ? (
              <section>
                <div className="mb-3 flex items-center justify-between gap-4">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-[#d7c08d]">The Briefing</h2>
                  <Link href="/briefing" className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500 transition hover:text-white">
                    Open all
                  </Link>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {secondaryBriefing.map((story) => (
                    <CompactStoryLink key={story.id} story={story} />
                  ))}
                </div>
              </section>
            ) : null}

            {latest.length > 0 ? (
              <section>
                <div className="mb-3 flex items-center justify-between gap-4">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-[#d7c08d]">Latest</h2>
                  <Link href="/" className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500 transition hover:text-white">
                    Full feed
                  </Link>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {latest.map((story) => (
                    <CompactStoryLink key={story.id} story={story} />
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <aside className="space-y-4 md:sticky md:top-6">
            <section className="rounded-[14px] border border-[#1c3953]/70 bg-[#081724] p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d7c08d]">Following</div>
              <h2 className="mt-2 text-xl font-semibold text-neutral-100">
                {authenticated ? "Your signal, filtered" : "Follow what matters"}
              </h2>
              <p className="mt-3 text-sm leading-6 text-neutral-400">
                {authenticated
                  ? "Open your followed stories and interests without digging through the full feed."
                  : "Create an account to follow topics and track stories from social links back into one feed."}
              </p>
              <Link
                href={authenticated ? "/?tab=following" : "/account/login"}
                className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#8f7740]/70 bg-[#07101a] px-5 py-2 text-sm font-semibold text-neutral-100 transition hover:border-[#b89a55] hover:bg-[#0a1724]"
              >
                {authenticated ? "Open Following" : "Log in to follow"}
              </Link>
            </section>

            <section className="rounded-[14px] border border-[#1c3953]/70 bg-[#081724] p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d7c08d]">Alerts</div>
              <h2 className="mt-2 text-xl font-semibold text-neutral-100">Urgent news only</h2>
              <p className="mt-3 text-sm leading-6 text-neutral-400">
                Turn on notifications for major updates without turning the feed into noise.
              </p>
              <Link
                href="/notifications"
                className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#1c3953]/75 bg-[#020b14] px-5 py-2 text-sm font-semibold text-[#d7e2ef] transition hover:border-[#30516d] hover:bg-[#06131e]"
              >
                Manage alerts
              </Link>
            </section>

          </aside>
        </div>
      </div>
    </main>
  );
}
