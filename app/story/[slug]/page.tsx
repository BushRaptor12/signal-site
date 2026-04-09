import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { formatStoryDate, formatUpdatedAt } from "@/app/lib/dates";
import { buildRelatedStories } from "@/app/lib/related-stories";
import { SITE_NAME, absoluteUrl, buildStoryMetadata, storyDescription, storyKeywords, storyModifiedTime, storyPublishedTime } from "@/app/lib/seo";
import { supabaseServer } from "@/app/lib/supabase.server";
import { coerceStory, type StoryDbRow } from "@/app/lib/stories";
import type { StoryWithViews } from "@/app/lib/types";
import ViewTracker from "./view-tracker";
import ReactionBar from "./reaction-bar";
import SourceTitle from "./source-title";
import ShareButton from "@/app/share-button";

function leanBadgeClasses(lean: "Left" | "Center" | "Right") {
  switch (lean) {
    case "Left":
      return "border border-blue-500/40 text-blue-300";
    case "Center":
      return "border border-neutral-600 text-neutral-300";
    case "Right":
      return "border border-red-500/40 text-red-300";
    default:
      return "border border-neutral-600 text-neutral-300";
  }
}

function storyHref(id: string, from?: string) {
  return from ? `/story/${id}?from=${encodeURIComponent(from)}` : `/story/${id}`;
}

async function loadStory(slug: string) {
  const supabase = supabaseServer();
  const { data, error } = await supabase.from("stories").select("*").eq("id", slug).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return coerceStory(data as StoryDbRow);
}

async function loadRelatedStoryPool(currentStory: StoryWithViews) {
  const supabase = supabaseServer();
  const manualIds = currentStory.related_story_ids.filter((id) => id && id !== currentStory.id);

  const [{ data: recentData, error: recentError }, manualResult] = await Promise.all([
    supabase.from("stories").select("*").neq("id", currentStory.id).order("created_at", { ascending: false }).limit(80),
    manualIds.length > 0
      ? supabase.from("stories").select("*").in("id", manualIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (recentError) throw recentError;
  if (manualResult.error) throw manualResult.error;

  const merged = new Map<string, StoryWithViews>();
  for (const row of (manualResult.data ?? []) as StoryDbRow[]) {
    const story = coerceStory(row);
    if (story.id !== currentStory.id) merged.set(story.id, story);
  }
  for (const row of (recentData ?? []) as StoryDbRow[]) {
    const story = coerceStory(row);
    if (story.id !== currentStory.id) merged.set(story.id, story);
  }

  return Array.from(merged.values());
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  try {
    const story = await loadStory(slug);
    if (!story) {
      return {
        title: "Story",
        robots: {
          index: false,
          follow: false,
        },
      };
    }

    return buildStoryMetadata(story);
  } catch {
    return {
      title: "Story",
      robots: {
        index: false,
        follow: false,
      },
    };
  }
}

export default async function StoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ from?: string | string[] }>;
}) {
  const { slug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const rawFrom = resolvedSearchParams?.from;
  const from = Array.isArray(rawFrom) ? rawFrom[0] : rawFrom;

  const backHref =
    from === "briefing" || from === "beacon" ? "/briefing" : from ? `/?tab=${encodeURIComponent(from)}` : "/";

  let story: StoryWithViews | null = null;
  let relatedStories: StoryWithViews[] = [];

  try {
    story = await loadStory(slug);
    if (story) {
      relatedStories = buildRelatedStories(story, await loadRelatedStoryPool(story));
    }
  } catch {
    story = null;
    relatedStories = [];
  }

  if (!story) {
    return (
      <main className="min-h-screen bg-transparent px-6 py-12 text-neutral-100">
        <div className="max-w-3xl mx-auto">
          <Link
            href={backHref}
            className="inline-flex w-fit rounded-full border border-[#0d2438] bg-[#020b14] px-5 py-2 text-sm text-[#d7e2ef] transition hover:border-[#163754] hover:bg-[#03101b]"
          >
            Back
          </Link>
          <div className="mt-10 rounded-2xl border border-[#15324d] bg-[#03101b] p-8 shadow-[0_18px_44px_rgba(0,0,0,0.22)]">
            <h1 className="text-2xl font-semibold">Story not found</h1>
            <p className="text-neutral-400 mt-2">
              {`This story is not available: ${slug}`}
            </p>
          </div>
        </div>
      </main>
    );
  }

  const updatedAt = story.content_updated_at ?? story.created_at ?? null;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: story.title,
    description: storyDescription(story),
    datePublished: storyPublishedTime(story),
    dateModified: storyModifiedTime(story),
    mainEntityOfPage: absoluteUrl(`/story/${story.id}`),
    isAccessibleForFree: true,
    image: story.image_url ? [story.image_url] : undefined,
    articleSection: story.topics,
    keywords: storyKeywords(story).join(", "),
    about: story.primary_entities.map((entity) => ({
      "@type": "Thing",
      name: entity,
    })),
    author: {
      "@type": "Organization",
      name: SITE_NAME,
    },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      logo: {
        "@type": "ImageObject",
        url: absoluteUrl("/small logo.png"),
      },
    },
  };

  return (
    <main className="min-h-screen bg-transparent px-6 py-12 text-neutral-100">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ViewTracker slug={slug} />
      <div className="mx-auto max-w-[80rem] xl:grid xl:grid-cols-[minmax(0,48rem)_20rem] xl:gap-10">
        <div className="mx-auto max-w-3xl xl:mx-0">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <Link
            href={backHref}
            className="inline-flex w-fit justify-self-start rounded-full border border-[#0d2438] bg-[#020b14] px-5 py-2 text-sm text-[#d7e2ef] transition hover:border-[#163754] hover:bg-[#03101b]"
          >
            Back
          </Link>
          <div className="justify-self-center text-center">
            <Link href="/" aria-label="Go to The Beacon home page" className="inline-block">
              <Image
                src="/small logo.png"
                alt="Signal logo"
                width={600}
                height={140}
                priority
                className="h-auto w-[144px] md:w-[168px]"
              />
            </Link>
            <p className="mt-1 text-[11px] text-neutral-500 md:text-xs">Multi-source news. Clear perspective.</p>
          </div>
          <div className="justify-self-end text-sm text-neutral-500">
            {story.views} {story.views === 1 ? "view" : "views"} | {story.comments} comments
          </div>
        </div>

        <div className="relative mt-8 rounded-2xl border border-[#15324d] bg-[#03101b] p-8 pb-12 shadow-[0_22px_55px_rgba(0,0,0,0.24)]">
          <h1 className="text-3xl font-semibold leading-tight">{story.title}</h1>

          <div className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Summary</h2>
            <div className="mt-4 space-y-3 text-[1.05rem] text-neutral-200">
              {story.summary.map((point, i) => (
                <p key={i} className="leading-8">
                  {point}
                </p>
              ))}
            </div>
          </div>

          <div className="absolute bottom-4 right-5 z-10">
            <ShareButton title={story.title} path={`/story/${story.id}`} />
          </div>
        </div>

        <div className="mt-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Coverage</h2>
              {story.pinned ? (
                <p className="mt-1 text-sm text-neutral-500">
                  Updated: {updatedAt ? formatUpdatedAt(updatedAt) : "--"}
                </p>
              ) : null}
            </div>
            <p className="text-sm text-neutral-500">Multiple sources, one story.</p>
          </div>

          <div className="mt-4 space-y-3">
            {story.sources.map((src, i) => (
              <a
                key={i}
                href={src.url}
                target="_blank"
                rel="noreferrer"
                className="group block rounded-2xl border border-[#13314b] bg-[#03101b] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.14)] transition hover:-translate-y-0.5 hover:border-[#21496b] hover:bg-[#041524] hover:shadow-[0_16px_38px_rgba(0,0,0,0.2)]"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex flex-1 items-center gap-3">
                    <div className="shrink-0 text-base font-semibold text-neutral-100">{src.name}</div>
                    <span className={`shrink-0 text-xs px-2 py-1 rounded-full ${leanBadgeClasses(src.lean)}`}>
                      {src.lean}
                    </span>
                    {src.title ? (
                      <SourceTitle
                        title={src.title}
                        className="block min-w-0 flex-1 overflow-hidden whitespace-nowrap text-sm text-neutral-300 transition group-hover:text-neutral-200"
                      />
                    ) : null}
                  </div>
                  <div className="shrink-0 text-sm text-neutral-500 transition group-hover:text-neutral-300">Read -&gt;</div>
                </div>
              </a>
            ))}
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-[#13314b] bg-[#03101b] p-6 shadow-[0_16px_38px_rgba(0,0,0,0.18)]">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Reactions</h2>
            </div>
          </div>

          <div className="mt-4">
            <ReactionBar slug={slug} />
          </div>
        </div>

        <div className="mt-10 rounded-2xl border border-[#13314b] bg-[#03101b] p-8 shadow-[0_16px_38px_rgba(0,0,0,0.18)]">
          <h2 className="text-lg font-semibold">Comments</h2>
          <p className="text-neutral-400 mt-2">Coming next.</p>
        </div>
        </div>

        {relatedStories.length > 0 ? (
          <aside className="mt-10 xl:mt-0 xl:sticky xl:top-8 xl:self-start">
            <div className="rounded-2xl border border-[#13314b] bg-[#03101b] p-6 shadow-[0_16px_38px_rgba(0,0,0,0.18)]">
              <h2 className="text-lg font-semibold text-neutral-100">Related Stories</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-500">
                Automatic matches use shared topics and entities. Manual links from the editor show first.
              </p>

              <div className="mt-5 space-y-4">
                {relatedStories.map((relatedStory) => (
                  <Link
                    key={relatedStory.id}
                    href={storyHref(relatedStory.id, from)}
                    className="block rounded-2xl border border-[#0d2438] bg-[#020b14] p-4 transition hover:border-[#163754] hover:bg-[#041524]"
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                      {formatStoryDate(relatedStory.date)}
                    </div>
                    <div className="mt-2 text-base font-semibold leading-6 text-neutral-100">{relatedStory.title}</div>
                    {relatedStory.summary[0] ? (
                      <p className="mt-2 text-sm leading-6 text-neutral-400">{relatedStory.summary[0]}</p>
                    ) : null}
                  </Link>
                ))}
              </div>
            </div>
          </aside>
        ) : null}
      </div>
    </main>
  );
}
