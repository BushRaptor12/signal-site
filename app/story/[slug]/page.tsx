import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import BackLink from "@/app/back-link";
import FollowInterestButton from "@/app/follow-interest-button";
import { getAccountProfile, getAccountStoryState, getFollowedInterests, getSeenStoryIds } from "@/app/lib/account.server";
import { formatStoryDate, formatUpdatedAt } from "@/app/lib/dates";
import { imageObjectPosition } from "@/app/lib/image-focus";
import { SITE_NAME, absoluteUrl, breadcrumbJsonLd, buildStoryMetadata, storyDescription, storyKeywords, storyModifiedTime, storyPublishedTime } from "@/app/lib/seo";
import { PUBLIC_INSET_ELEVATED, PUBLIC_PAGE } from "@/app/lib/surfaces";
import { supabaseServer } from "@/app/lib/supabase.server";
import { isPaywalledSource } from "@/app/lib/source-access";
import { coerceStory, type StoryDbRow } from "@/app/lib/stories";
import type { StoryWithViews } from "@/app/lib/types";
import { normalize, toTitleCase } from "@/app/lib/vocab";
import ViewTracker from "./view-tracker";
import ReactionBar from "./reaction-bar";
import SourceTitle from "./source-title";
import StoryPageImage from "./story-page-image";
import ShareButton from "@/app/share-button";
import StoryReaderActions from "./story-reader-actions";
import CommentsSection from "./comments-section";
import StoryEngagementSummary from "./story-engagement-summary";

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

function shouldShowStoryImageOnStoryPage(story: StoryWithViews) {
  return Boolean(story.image_url) && Boolean(story.image_show_on_story_page);
}

function SeenBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#d7c08d]">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3 w-3 fill-none stroke-current stroke-[1.8]">
        <path d="M1.5 12s3.75-6 10.5-6 10.5 6 10.5 6-3.75 6-10.5 6S1.5 12 1.5 12Z" />
        <circle cx="12" cy="12" r="3.25" />
      </svg>
      <span>Seen</span>
    </span>
  );
}

function PaywallBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#d7c08d]">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3 w-3 fill-none stroke-current stroke-[2]">
        <rect x="5" y="10" width="14" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </svg>
      <span>PayWall</span>
    </span>
  );
}

async function loadStory(slug: string, includeUnpublished = false) {
  const supabase = supabaseServer();
  let query = supabase.from("stories").select("*").eq("id", slug);
  if (!includeUnpublished) {
    query = query.eq("status", "published");
  }
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return coerceStory(data as StoryDbRow);
}

async function loadManualRelatedStories(currentStory: StoryWithViews, includeUnpublished = false) {
  const supabase = supabaseServer();
  const manualIds = currentStory.related_story_ids.filter((id) => id && id !== currentStory.id);
  if (manualIds.length === 0) return [];

  let query = supabase.from("stories").select("*").in("id", manualIds);
  if (!includeUnpublished) {
    query = query.eq("status", "published");
  }
  const { data, error } = await query;
  if (error) throw error;

  const byId = new Map(
    ((data ?? []) as StoryDbRow[])
      .map(coerceStory)
      .filter((story) => story.id !== currentStory.id)
      .map((story) => [story.id, story])
  );

  return manualIds.map((id) => byId.get(id)).filter((story): story is StoryWithViews => Boolean(story));
}

async function loadRecentStories(currentStory: StoryWithViews, excludeIds: string[], limit: number, includeUnpublished = false) {
  if (limit <= 0) return [];

  const supabase = supabaseServer();
  const blockedIds = new Set([currentStory.id, ...excludeIds]);
  let query = supabase
    .from("stories")
    .select("*")
    .neq("id", currentStory.id)
    .order("content_updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(Math.max(limit, 12));
  if (!includeUnpublished) {
    query = query.eq("status", "published");
  }
  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as StoryDbRow[])
    .map(coerceStory)
    .filter((story) => !blockedIds.has(story.id))
    .slice(0, limit);
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
    from === "briefing" || from === "beacon"
      ? "/briefing"
      : from === "account"
        ? "/account"
        : from
          ? `/?tab=${encodeURIComponent(from)}`
          : "/";

  let story: StoryWithViews | null = null;
  let relatedStories: StoryWithViews[] = [];
  let otherRecentStories: StoryWithViews[] = [];
  let seenStoryIds = new Set<string>();
  const accountProfile = await getAccountProfile();
  const isAdmin = Boolean(accountProfile?.isAdmin);

  try {
    story = await loadStory(slug, isAdmin);
    if (story) {
      relatedStories = (await loadManualRelatedStories(story, isAdmin)).slice(0, 5);
      const recentCandidates = await loadRecentStories(
        story,
        relatedStories.map((relatedStory) => relatedStory.id),
        36,
        isAdmin
      );
      const seenCandidates = [...relatedStories, ...recentCandidates];
      seenStoryIds = new Set(accountProfile ? await getSeenStoryIds(accountProfile.userId, seenCandidates) : []);
      const unseenRecentStories = recentCandidates.filter((recentStory) => !seenStoryIds.has(recentStory.id));
      const seenRecentStories = recentCandidates.filter((recentStory) => seenStoryIds.has(recentStory.id));
      otherRecentStories = [...unseenRecentStories, ...seenRecentStories].slice(0, Math.max(0, 5 - relatedStories.length));
    }
  } catch {
    story = null;
    relatedStories = [];
    otherRecentStories = [];
    seenStoryIds = new Set<string>();
  }

  if (!story) {
    return (
      <main className={PUBLIC_PAGE}>
        <div className="max-w-3xl mx-auto">
          <BackLink href={backHref} />
          <div className={`mt-6 ${PUBLIC_INSET_ELEVATED} p-5 sm:mt-10 sm:p-8`}>
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
  const storyState = accountProfile ? await getAccountStoryState(accountProfile.userId, story) : null;
  const followedInterestSet = new Set(
    accountProfile
      ? (await getFollowedInterests(accountProfile.userId).catch(() => [])).map((interest) => interest.normalizedQuery)
      : []
  );
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

  const storyLinks = [...relatedStories, ...otherRecentStories];
  const breadcrumb = breadcrumbJsonLd([
    { name: SITE_NAME, item: "/" },
    { name: "Stories", item: "/" },
    { name: story.title, item: `/story/${story.id}` },
  ]);

  return (
    <main className={PUBLIC_PAGE}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <ViewTracker slug={slug} />
      <div className="mx-auto max-w-3xl">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 sm:grid-cols-[1fr_auto_1fr] sm:gap-4">
          <BackLink href={backHref} className="justify-self-start" />
          <div className="justify-self-center text-center">
            <Link href="/" aria-label="Go to The Beacon home page" className="inline-block">
              <Image
                src="/small logo.png"
                alt="Signal logo"
                width={600}
                height={140}
                priority
                className="h-auto w-[122px] sm:w-[156px] md:w-[184px]"
              />
            </Link>
            <p className="mt-1 hidden text-[11px] text-neutral-500 sm:block md:text-xs">One Story, Multiple Perspectives.</p>
          </div>
          <div className="justify-self-end">
            {isAdmin ? (
              <Link
                href={`/admin/editor?story=${encodeURIComponent(story.id)}`}
                className="inline-flex min-h-10 rounded-full border border-[#8f7740]/60 bg-[#08131d] px-3 py-2 text-xs font-semibold text-neutral-100 transition hover:border-[#b89a55] hover:bg-[#0b1824] sm:px-4"
              >
                Edit story
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      <div
        className="mx-auto mt-6 max-w-[100rem] sm:mt-8 xl:grid xl:grid-cols-[1fr_15rem_minmax(0,48rem)_15rem_1fr] xl:gap-6"
      >
        <div className="hidden xl:block" />
        <div className="hidden xl:block" />

        <div className="min-w-0 xl:col-start-3">
          <article className="min-w-0 max-w-full rounded-[18px] border border-[#1d3952]/50 bg-[#081520]/88 p-4 shadow-[0_12px_28px_rgba(0,0,0,0.12)] sm:rounded-[22px] sm:p-8">
            <header className="border-b border-[#1a3349]/60 pb-5 sm:pb-6">
              <h1 className="text-[2rem] font-semibold leading-[1.05] text-neutral-50 sm:text-[2.55rem]">
                {story.title}
              </h1>
            </header>

            <div
              className={
                shouldShowStoryImageOnStoryPage(story) && story.image_display === "contain"
                  ? "mt-6 flex flex-col gap-6 xl:flex-row xl:items-start"
                  : "mt-6"
              }
            >
              {shouldShowStoryImageOnStoryPage(story) ? (
                <div
                  className={
                    story.image_display === "contain"
                      ? "min-w-0 w-full xl:w-auto xl:max-w-[24rem] xl:shrink-0"
                      : "min-w-0 w-full"
                  }
                >
                  <StoryPageImage
                    alt={story.title}
                    display={story.image_display}
                    objectPosition={imageObjectPosition(story)}
                    src={story.image_url!}
                  />
                </div>
              ) : null}

              <div
                className={
                  shouldShowStoryImageOnStoryPage(story) && story.image_display === "contain"
                    ? "min-w-0 flex-1 space-y-3.5 text-[1.02rem] text-neutral-200 sm:text-[1.08rem]"
                    : "space-y-3.5 text-[1.02rem] text-neutral-200 sm:text-[1.08rem]"
                }
              >
                {story.summary.map((point, i) => (
                  <p key={i} className="leading-7 sm:leading-8">
                    {point}
                  </p>
                ))}

                {updatedAt ? (
                  <div className="pt-2 text-right text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                    Updated {formatUpdatedAt(updatedAt)}
                  </div>
                ) : null}
              </div>
            </div>

            <section className="mt-8 border-t border-[#1a3349]/60 pt-5">
              <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d7c08d]">Sources</div>
              <div className="space-y-3">
                {story.sources.map((src, i) => (
                  <a
                    key={i}
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block rounded-[14px] border border-[#214765]/70 bg-[#0a1926] p-4 transition hover:-translate-y-0.5 hover:border-[#30516d] hover:bg-[#0c1d2b] sm:p-5"
                  >
                    <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <div className="min-w-0 text-[1.08rem] font-semibold text-neutral-50">{src.name}</div>
                          {isPaywalledSource(src.name, src.url) ? <PaywallBadge /> : null}
                          {src.badge ? (
                            <span className="shrink-0 rounded-full border border-[#8f7740]/55 bg-[#8f7740]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#e3cca0]">
                              {src.badge}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-3">
                          {src.title ? (
                            <SourceTitle
                              title={src.title}
                              className="block text-[15px] leading-6 text-neutral-300 transition group-hover:text-neutral-100"
                            />
                          ) : (
                            <div className="text-[15px] leading-6 text-neutral-400 transition group-hover:text-neutral-300">
                              Open source
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-row items-center gap-3 text-center sm:flex-col sm:items-end sm:gap-2">
                        <span className={`rounded-full px-2 py-1 text-xs ${leanBadgeClasses(src.lean)}`}>
                          {src.lean}
                        </span>
                        <div className="inline-flex min-h-8 items-center text-[13px] font-semibold text-neutral-400 transition group-hover:text-white">
                          Read
                          <span className="ml-1.5" aria-hidden="true">-&gt;</span>
                        </div>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </section>

            {(story.topics[0] || story.primary_entities[0]) ? (
              <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-[#1a3349]/60 pt-4">
                {[story.topics[0], story.primary_entities[0]]
                  .filter((value, valueIndex, values): value is string => Boolean(value) && values.indexOf(value) === valueIndex)
                  .map((value) => {
                    const normalizedValue = normalize(value);
                    return (
                      <FollowInterestButton
                        key={`${story.id}-follow-${normalizedValue}`}
                        authenticated={Boolean(accountProfile)}
                        initialFollowing={followedInterestSet.has(normalizedValue)}
                        label={toTitleCase(normalizedValue)}
                        query={value}
                      />
                    );
                  })}
              </div>
            ) : null}

            <div className={`${story.topics[0] || story.primary_entities[0] ? "mt-4" : "mt-8"} flex flex-col items-stretch justify-between gap-4 border-t border-[#1a3349]/60 pt-4 sm:flex-row sm:flex-wrap sm:items-center`}>
              <StoryEngagementSummary
                key={story.id}
                initialCommentCount={story.comments}
                storyId={story.id}
                views={story.views}
              />
              <div className="flex flex-wrap items-center gap-3">
                <StoryReaderActions
                  authenticated={Boolean(accountProfile)}
                  initialFollowing={Boolean(storyState?.following)}
                  storyId={story.id}
                />
                <ShareButton title={story.title} path={`/story/${story.id}`} />
              </div>
            </div>
          </article>

          <section className={`mt-8 ${PUBLIC_INSET_ELEVATED} p-6`}>
            <div className="mb-5">
              <ReactionBar slug={slug} minimal />
            </div>
            <CommentsSection
              authenticated={Boolean(accountProfile)}
              currentUserId={accountProfile?.userId ?? null}
              embedded
              isAdmin={isAdmin}
              storyId={story.id}
            />
          </section>

          {storyLinks.length > 0 ? (
            <section className="mt-8 xl:hidden">
              <div className="rounded-[22px] border border-[#183149]/45 bg-[#06131d]/64 p-5 shadow-[0_10px_22px_rgba(0,0,0,0.1)]">
                {relatedStories.length > 0 ? (
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d7c08d]">Related Stories</div>
                    <div className="mt-3 divide-y divide-[#183149]/50">
                      {relatedStories.map((relatedStory) => (
                        <Link
                          key={relatedStory.id}
                          href={storyHref(relatedStory.id, from)}
                          className="block py-4 first:pt-0 last:pb-0"
                        >
                          <div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                            <span>{formatStoryDate(relatedStory.date)}</span>
                            {seenStoryIds.has(relatedStory.id) ? <SeenBadge /> : null}
                          </div>
                          <div className="mt-2 text-[15px] font-semibold leading-6 text-neutral-100 transition hover:text-[#dbe8f6]">
                            {relatedStory.title}
                          </div>
                          {relatedStory.summary[0] ? (
                            <p className="mt-2 text-sm leading-6 text-neutral-500">{relatedStory.summary[0]}</p>
                          ) : null}
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}

                {otherRecentStories.length > 0 ? (
                  <div className={relatedStories.length > 0 ? "mt-6" : "mt-4"}>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d7c08d]">
                      {relatedStories.length > 0 ? "Other Recent Stories" : "Recent Stories"}
                    </div>
                    <div className="mt-3 divide-y divide-[#183149]/50">
                      {otherRecentStories.map((recentStory) => (
                        <Link
                          key={recentStory.id}
                          href={storyHref(recentStory.id, from)}
                          className="block py-4 first:pt-0 last:pb-0"
                        >
                          <div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                            <span>{formatStoryDate(recentStory.date)}</span>
                            {seenStoryIds.has(recentStory.id) ? <SeenBadge /> : null}
                          </div>
                          <div className="mt-2 text-[15px] font-semibold leading-6 text-neutral-100 transition hover:text-[#dbe8f6]">
                            {recentStory.title}
                          </div>
                          {recentStory.summary[0] ? (
                            <p className="mt-2 text-sm leading-6 text-neutral-500">{recentStory.summary[0]}</p>
                          ) : null}
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>

        {storyLinks.length > 0 ? (
          <aside className="hidden xl:col-start-4 xl:block xl:w-60 xl:self-start xl:pt-1">
            <div className="rounded-[22px] border border-[#183149]/45 bg-[#06131d]/64 p-5 shadow-[0_10px_22px_rgba(0,0,0,0.1)]">
              {relatedStories.length > 0 ? (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d7c08d]">Related Stories</div>
                  <div className="mt-3 divide-y divide-[#183149]/50">
                    {relatedStories.map((relatedStory) => (
                      <Link
                        key={relatedStory.id}
                        href={storyHref(relatedStory.id, from)}
                        className="block py-4 first:pt-0 last:pb-0"
                      >
                        <div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                          <span>{formatStoryDate(relatedStory.date)}</span>
                          {seenStoryIds.has(relatedStory.id) ? <SeenBadge /> : null}
                        </div>
                        <div className="mt-2 text-[15px] font-semibold leading-6 text-neutral-100 transition hover:text-[#dbe8f6]">
                          {relatedStory.title}
                        </div>
                        {relatedStory.summary[0] ? (
                          <p className="mt-2 text-sm leading-6 text-neutral-500">{relatedStory.summary[0]}</p>
                        ) : null}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}

              {otherRecentStories.length > 0 ? (
                <div className={relatedStories.length > 0 ? "mt-6" : "mt-4"}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d7c08d]">
                    {relatedStories.length > 0 ? "Other Recent Stories" : "Recent Stories"}
                  </div>
                  <div className="mt-3 divide-y divide-[#183149]/50">
                    {otherRecentStories.map((recentStory) => (
                      <Link
                        key={recentStory.id}
                        href={storyHref(recentStory.id, from)}
                        className="block py-4 first:pt-0 last:pb-0"
                      >
                        <div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                          <span>{formatStoryDate(recentStory.date)}</span>
                          {seenStoryIds.has(recentStory.id) ? <SeenBadge /> : null}
                        </div>
                        <div className="mt-2 text-[15px] font-semibold leading-6 text-neutral-100 transition hover:text-[#dbe8f6]">
                          {recentStory.title}
                        </div>
                        {recentStory.summary[0] ? (
                          <p className="mt-2 text-sm leading-6 text-neutral-500">{recentStory.summary[0]}</p>
                        ) : null}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </aside>
        ) : null}

        <div className="hidden xl:block" />
      </div>
    </main>
  );
}
